import { Grid, Button, Typography, CircularProgress } from "@mui/material";
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { QrReader } from "react-qr-reader";
import { styled } from "@mui/system";
import { DialogConfirm } from "./components/DialogConfirm";
import { ViewFinder } from "./components/ViewFinder";
import QRCode from "react-qr-code";
import { epochNowInSeconds, prettyNumbers } from "./common/utils";

import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import CurrencyBitcoinIcon from "@mui/icons-material/CurrencyBitcoin";
import CancelIcon from "@mui/icons-material/Cancel";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import AirIcon from "@mui/icons-material/Air";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import GroupsIcon from "@mui/icons-material/Groups";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";

const StackVerticalButton = styled(Button)({
  display: "flex",
  flexDirection: "column",
  height: "150px",
  width: "200px",
  fontSize: "20px",
});

type MachineState = {
  isEmptyingInProgress: boolean;
  isDepositInProgress: boolean;
  numOfNotes: number;
  currentDeposit: number;
  cadPerPol: number;
  cadPerBtc: number;
  cadPerL2Eth: number;
  cadPerHype: number;
  currentBtcToRecv: number;
  currentL2EthToRecv: number;
  currentPolToRecv: number;
  currentHypeToRecv: number;
  currency: string;
  membershipCadPer30Days: number;
  curMembershipTimeExtend: number;
  rateLastUpdatedTimestamp: number;
  ethWalletAddress: string;
  polBalanceOnPolygon: number;
  version: string;
};

type FinishDepositResp = {
  txHash: string;
  totalCryptoToRecv: number;
  totalDepositCAD: number;
  explorerTx: string;
  recipientPrimaryName?: string | null;
};

type FobUserState = {
  name: null | string;
  expire_timestamp: null | number;
};

const ATM_BACKEND_URL = "http://localhost:3000";

enum PageState {
  MAIN,

  CHECK_MEMBERSHIP,
  CHECK_MEMBERSHIP_SCANNED_FOB,
  CHECK_MEMBERSHIP_INSERT_BILL,
  CHECK_MEMBERSHIP_EXTENDING,
  CHECK_MEMBERSHIP_EXTENDED_MEMBERSHIP,

  BUYING_POL_SCAN_ADDRESS,
  BUYING_POL_INSERT_BILL,
  BUYING_POL_SENDING_TX,
  BUYING_POL_TX_RECEIPT,

  BUYING_BITCOIN_SCAN_ADDRESS,
  BUYING_BITCOIN_INSERT_BILL,
  BUYING_BITCOIN_SENDING_TX,
  BUYING_BITCOIN_TX_RECEIPT,

  // arb, op, base
  BUYING_L2_ETH_INSERT_BILL,
  BUYING_L2_ETH_SCAN_ADDRESS,
  BUYING_L2_ETH_SENDING_TX,
  BUYING_L2_ETH_TX_RECEIPT,

  // hype
  BUYING_HYPE_INSERT_BILL,
  BUYING_HYPE_SCAN_ADDRESS,
  BUYING_HYPE_SENDING_TX,
  BUYING_HYPE_TX_RECEIPT
}

function App() {
  const [keyFobId, setKeyFobId] = useState("");
  const [fobUser, setFobUser] = useState<null | FobUserState>(null);
  const [advancedView, setAdvanedView] = useState(false);
  const [machineState, setMachineState] = useState<null | MachineState>(null);
  const [pageState, setPageState] = useState<PageState>(PageState.MAIN);

  // ad-hoc: it's meh, I know, to be removed during refactoring
  const [nextPageState, setNextPageState] = useState<{
    state: PageState | null, nextState: PageState | null, data?: any
  }>({ state: null, nextState: null });

  const [finishDepositResp, setFinishDepositResp] =
    useState<null | FinishDepositResp>(null);
  const [recipientAddress, setRecipientAddress] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [recipientHLName, setRecipientHLName] = useState<string | null>(null);

  const [isDoneDepositingOpen, setIsDoneDepositingOpen] = useState(false);
  const [isDoneDepositingBtcOpen, setIsDoneDepositingBtcOpen] = useState(false);
  const [isDoneDepositingMembershipOpen, setIsDoneDepositingMembershipOpen] =
    useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);

  const [isConfirmAddressDialogOpen, setIsConfirmAddressDialogOpen] =
    useState<boolean>(false);

  const [isFeeWarningOpen, setIsFeeWarningOpen] =
    useState<boolean>(false);

  // Yes very dirty but whatever
  let keysLogged = "";
  const keyPressListener = (x: KeyboardEvent) => {
    if (x.key.toLowerCase() !== "enter") {
      keysLogged = keysLogged + x.key;
    } else {
      setKeyFobId(keysLogged);
      keysLogged = "";
      setPageState(PageState.CHECK_MEMBERSHIP_SCANNED_FOB);
    }
  };

  // eslint-disable-next-line
  const handleRFIDKeyDown = useMemo(() => keyPressListener, []);

  const cancelAndReturnHome = useCallback(() => {
    if (
      pageState === PageState.BUYING_POL_INSERT_BILL ||
      pageState === PageState.CHECK_MEMBERSHIP_INSERT_BILL ||
      pageState === PageState.BUYING_L2_ETH_INSERT_BILL ||
      pageState === PageState.BUYING_BITCOIN_INSERT_BILL ||
      pageState === PageState.BUYING_HYPE_INSERT_BILL
    ) {
      fetch(`${ATM_BACKEND_URL}/deposit/cancel`, { method: "POST" }).catch(
        (e) => {
          alert(`Error occured while cancelling: ${e || "unknown"}`);
        }
      );
    }

    setRecipientAddress(null);
    setRecipientHLName(null);
    setPageState(PageState.MAIN);
    setNextPageState({ state: null, nextState: null });
    setIsReturnDialogOpen(false);
  }, [pageState]);

  const confirmUserAddressAndProceed = useCallback((address: string) => {
    setIsConfirmAddressDialogOpen(false);
    setRecipientAddress(address);

    if (nextPageState.state) {
      setPageState(nextPageState.state);
      // set next page state to sending tx
      setNextPageState({ state: nextPageState.nextState, nextState: null, data: nextPageState.data });
    } else if (address.includes('@')) {
      setPageState(PageState.BUYING_BITCOIN_INSERT_BILL);
    } else {
      setPageState(PageState.BUYING_POL_INSERT_BILL);
    }

    fetch(`${ATM_BACKEND_URL}/deposit/start`, { method: "POST" }).catch((e) => {
      alert(`Error occured ${e || "unknown"}`);
    });
  }, [nextPageState]);

  const getMachineState = useCallback(async () => {
    const resp = await fetch(`${ATM_BACKEND_URL}/stats`).then((x) => x.json());
    setMachineState(resp as MachineState);
  }, [recipientAddress]);

  const getFobUserStats = useCallback(async () => {
    const resp = await fetch(
      `https://fobs.dctrl.wtf/fob/${keyFobId}/user`
    ).then((x) => x.json());
    setFobUser(resp as FobUserState);
  }, [setFobUser, keyFobId]);

  const finalizeDepositAndSendPol = useCallback(async () => {
    setPageState(PageState.BUYING_POL_SENDING_TX);
    fetch(`${ATM_BACKEND_URL}/deposit/end/polygon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipientAddress,
      }),
    })
      .then(async (resp) => {
        const respJ = await resp.json();
        setFinishDepositResp(respJ as FinishDepositResp);
        setPageState(PageState.BUYING_POL_TX_RECEIPT);
      })
      .catch((e) => {
        alert(`An error occurred ${e || "unknown"}`);
      });
  }, [recipientAddress]);

  const finalizeDepositAndSendBtc = useCallback(async () => {
    setPageState(PageState.BUYING_BITCOIN_SENDING_TX);
    fetch(`${ATM_BACKEND_URL}/deposit/end/bitcoin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipientAddress,
      }),
    })
      .then(async (resp) => {
        console.log("GOT RESP", resp);
        const respJ = await resp.json();
        setFinishDepositResp(respJ as FinishDepositResp);
        setPageState(PageState.BUYING_BITCOIN_TX_RECEIPT);
      })
      .catch((e) => {
        alert(`An error occurred ${e || "unknown"}`);
      });
  }, [recipientAddress]);

  const finalizeDepositAndSendL2Eth = useCallback(async (recipientAddress: string, endDepositEndpoint: string) => {
    setPageState(PageState.BUYING_L2_ETH_SENDING_TX);

    fetch(endDepositEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipientAddress,
      }),
    })
      .then(async (resp) => {
        const respJ = await resp.json();
        setFinishDepositResp(respJ as FinishDepositResp);
        setPageState(PageState.BUYING_L2_ETH_TX_RECEIPT);
      })
      .catch((e) => {
        alert(`An error occurred ${e || "unknown"}`);
      });
  }, []);

  const finalizeDepositAndSendHype = useCallback(async (recipientAddress: string, endDepositEndpoint: string) => {
    setPageState(PageState.BUYING_HYPE_SENDING_TX);

    fetch(endDepositEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipientAddress,
      }),
    })
      .then(async (resp) => {
        const respJ = await resp.json();
        setFinishDepositResp(respJ as FinishDepositResp);
        setPageState(PageState.BUYING_HYPE_TX_RECEIPT);
      })
      .catch((e) => {
        alert(`An error occurred ${e || "unknown"}`);
      });
  }, []);

  const finalizeDepositAndUpdateMembership = useCallback(async () => {
    setPageState(PageState.CHECK_MEMBERSHIP_EXTENDING);
    fetch(`${ATM_BACKEND_URL}/deposit/end/membership`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fobKey: keyFobId,
      }),
    })
      .then(async () => {
        await getFobUserStats();
        setPageState(PageState.CHECK_MEMBERSHIP_EXTENDED_MEMBERSHIP);
      })
      .catch((e) => {
        alert(`An error occurred ${e || "unknown"}`);
      });
  }, [keyFobId, getFobUserStats]);

  const onAddressScanned = useCallback(async (address: string) => {

    // If this is Hype transaction, resolve HL Name (Primary Name)
    if (nextPageState?.data?.chain?.name === "Hype") {
      try {
        const resp = await fetch(`${ATM_BACKEND_URL}/stats?address=${address}`).then((x) => x.json());

        if (resp.resolvedHypeName) {
          setRecipientHLName(resp.resolvedHypeName);
        }
      } catch (error) {
        console.error("Error resolving HL name:", error);
      }
    }

  }, [nextPageState]);

  useEffect(() => {
    if (pageState === PageState.CHECK_MEMBERSHIP) {
      document.addEventListener("keydown", handleRFIDKeyDown as any);
    } else {
      document.removeEventListener("keydown", handleRFIDKeyDown as any);
    }
  }, [pageState, handleRFIDKeyDown]);

  useEffect(() => {
    if (
      keyFobId !== "" &&
      pageState === PageState.CHECK_MEMBERSHIP_SCANNED_FOB
    ) {
      getFobUserStats();
    }
  }, [keyFobId, pageState, getFobUserStats]);

  useEffect(() => {
    if (machineState !== null) return;
    getMachineState();
    setInterval(getMachineState, 2500);
  }, [getMachineState, machineState]);

  return (
    <>
      <DialogConfirm
        title="Fees May Apply"
        bodyText="Hyperliquid charges a fee equivalent to 1 USD for deposits to new accounts. Press YES to continue."
        isOpen={isFeeWarningOpen}
        onConfirm={() => {
          setPageState(PageState.BUYING_HYPE_SCAN_ADDRESS);
          setNextPageState({
            state: PageState.BUYING_HYPE_INSERT_BILL,
            nextState: PageState.BUYING_HYPE_SENDING_TX,
            data: {
              endDeposit: finalizeDepositAndSendHype,
              endDepositEndpoint: `${ATM_BACKEND_URL}/deposit/end/hype`,
              chain: { name: "Hype", tsym: "HYPE" },
            }
          })
          setIsFeeWarningOpen(false)
        }
        }
        onClose={() => setIsFeeWarningOpen(false)}
      />
      <DialogConfirm
        title="Return Home?"
        bodyText="Do you really want to return home?"
        isOpen={isReturnDialogOpen}
        onConfirm={() => cancelAndReturnHome()}
        onClose={() => setIsReturnDialogOpen(false)}
      />
      <DialogConfirm
        title="Confirm Your Address"
        bodyText={`Confirm that ${qrCodeData}${recipientHLName ? ` (${recipientHLName})` : ''} is your address?`}
        isOpen={isConfirmAddressDialogOpen}
        onConfirm={() => confirmUserAddressAndProceed(qrCodeData)}
        onClose={() => setIsConfirmAddressDialogOpen(false)}
      />
      <DialogConfirm
        title="Confirm Done Depositing"
        bodyText={`Done depositing?`}
        isOpen={isDoneDepositingOpen}
        onConfirm={() => {
          if (nextPageState?.data?.endDeposit) {
            nextPageState.data.endDeposit(recipientAddress, nextPageState.data.endDepositEndpoint);
          } else {
            finalizeDepositAndSendPol();
          }
          setIsDoneDepositingOpen(false);
        }}
        onClose={() => setIsDoneDepositingOpen(false)}
      />
      <DialogConfirm
        title="Confirm Done Depositing"
        bodyText={`Done depositing?`}
        isOpen={isDoneDepositingBtcOpen}
        onConfirm={() => {
          finalizeDepositAndSendBtc();
          setPageState(PageState.BUYING_BITCOIN_SENDING_TX);
          setIsDoneDepositingBtcOpen(false);
        }}
        onClose={() => setIsDoneDepositingBtcOpen(false)}
      />
      <DialogConfirm
        title="Confirm Done Depositing"
        bodyText={`Finish deposit and extend membership?`}
        isOpen={isDoneDepositingMembershipOpen}
        onConfirm={() => {
          finalizeDepositAndUpdateMembership();
          setPageState(PageState.CHECK_MEMBERSHIP_EXTENDING);
          setIsDoneDepositingMembershipOpen(false);
        }}
        onClose={() => setIsDoneDepositingMembershipOpen(false)}
      />
      <Grid
        container
        spacing={0}
        direction="column"
        alignItems="center"
        justifyContent="center"
        style={{ minHeight: "20vh" }}
      >
        <Typography onClick={() => setAdvanedView(!advancedView)} variant="h4">
          YVR ON-BOARDOOOOR
        </Typography>
        <Typography variant="subtitle2">
          1 BTC = CAD $
          {machineState !== null
            ? prettyNumbers(machineState.cadPerBtc)
            : "--"}
          <br />
          1 ETH = CAD $
          {machineState !== null
            ? prettyNumbers(machineState.cadPerL2Eth)
            : "--"}
          <br />
          1 POL = CAD $
          {machineState !== null
            ? prettyNumbers(machineState.cadPerPol)
            : "--"}
          <br />
          1 HYPE = CAD $
          {machineState !== null
            ? prettyNumbers(machineState.cadPerHype)
            : "--"}
        </Typography>
        <br />
        {advancedView && (
          <Typography variant="subtitle1">
            Version: {machineState === null ? "--" : machineState.version}
            &nbsp;|&nbsp;Depositing:{" "}
            {machineState === null
              ? "--"
              : machineState.isDepositInProgress.toString()}
            &nbsp;|&nbsp;Emptying:{" "}
            {machineState === null
              ? "--"
              : machineState.isEmptyingInProgress.toString()}
            &nbsp;|&nbsp;POL Balance:{" "}
            {machineState !== null
              ? prettyNumbers(machineState.polBalanceOnPolygon)
              : "--"}
            &nbsp;|&nbsp;Last Updated:{" "}
            {machineState === null
              ? "--"
              : new Date(machineState.rateLastUpdatedTimestamp).toDateString() +
              " - " +
              new Date().toISOString().substring(11, 19)}
          </Typography>
        )}
      </Grid>
      <Grid
        container
        spacing={0}
        direction={pageState === PageState.MAIN ? undefined : "column"}
        alignItems="center"
        justifyContent="center"
        style={{ minHeight: "55vh" }}
      >
        {pageState === PageState.MAIN && (
          <>
            <StackVerticalButton
              disabled={undefined
                // (machineState !== null &&
                //   (machineState.isDepositInProgress ||
                //     machineState.isEmptyingInProgress)) ||
                // machineState === null
              }
              variant="contained"
              color="error"
              onClick={() => {
                setPageState(PageState.BUYING_BITCOIN_SCAN_ADDRESS);
              }}
            >
              <CurrencyBitcoinIcon style={{ fontSize: "50px" }} />
              ⚡︎ COINOS BTC ⚡︎ <br />
            </StackVerticalButton>
            &nbsp;&nbsp;
            <StackVerticalButton
              disabled={undefined
                // (machineState !== null &&
                //   (machineState.isDepositInProgress ||
                //     machineState.isEmptyingInProgress)) ||
                // machineState === null
              }
              variant="contained"
              color="info"
              onClick={() => {
                setPageState(PageState.BUYING_POL_SCAN_ADDRESS);
              }}
            >
              {/* <HexagonIcon style={{ fontSize: "50px" }} /> */}
              <img src={process.env.PUBLIC_URL + '/logos/polygon_logo.svg'} height={50} />
              POL <br />
            </StackVerticalButton>
            &nbsp;&nbsp;
            <StackVerticalButton
              disabled={undefined
                // (machineState !== null &&
                //   (machineState.isDepositInProgress ||
                //     machineState.isEmptyingInProgress)) ||
                // machineState === null
              }
              variant="contained"
              color="info"
              onClick={() => {
                setPageState(PageState.BUYING_L2_ETH_SCAN_ADDRESS);
                setNextPageState({
                  state: PageState.BUYING_L2_ETH_INSERT_BILL,
                  nextState: PageState.BUYING_L2_ETH_SENDING_TX,
                  data: {
                    endDeposit: finalizeDepositAndSendL2Eth,
                    endDepositEndpoint: `${ATM_BACKEND_URL}/deposit/end/arbitrum`,
                    chain: { name: "Arbitrum" }
                  }
                })
              }}
            >
              <img src={process.env.PUBLIC_URL + '/logos/arbitrum_logo.svg'} height={50} />
              ARB ETH <br />
            </StackVerticalButton>
            &nbsp;&nbsp;
            <StackVerticalButton
              disabled={undefined
                // (machineState !== null &&
                //   (machineState.isDepositInProgress ||
                //     machineState.isEmptyingInProgress)) ||
                // machineState === null
              }
              variant="contained"
              color="info"
              onClick={() => {
                setPageState(PageState.BUYING_L2_ETH_SCAN_ADDRESS);
                setNextPageState({
                  state: PageState.BUYING_L2_ETH_INSERT_BILL,
                  nextState: PageState.BUYING_L2_ETH_SENDING_TX,
                  data: {
                    endDeposit: finalizeDepositAndSendL2Eth,
                    endDepositEndpoint: `${ATM_BACKEND_URL}/deposit/end/optimism`,
                    chain: { name: "Optimism" }
                  }
                });
              }}
            >
              <img src={process.env.PUBLIC_URL + '/logos/optimism_logo.svg'} height={50} />
              OP ETH <br />
            </StackVerticalButton>
            &nbsp;&nbsp;
            <StackVerticalButton
              disabled={undefined
                // (machineState !== null &&
                //   (machineState.isDepositInProgress ||
                //     machineState.isEmptyingInProgress)) ||
                // machineState === null
              }
              variant="contained"
              color="info"
              onClick={() => {
                setPageState(PageState.BUYING_L2_ETH_SCAN_ADDRESS);
                setNextPageState({
                  state: PageState.BUYING_L2_ETH_INSERT_BILL,
                  nextState: PageState.BUYING_L2_ETH_SENDING_TX,
                  data: {
                    endDeposit: finalizeDepositAndSendL2Eth,
                    endDepositEndpoint: `${ATM_BACKEND_URL}/deposit/end/base`,
                    chain: { name: "Base" }
                  }
                });
              }}
            >
              <img src={process.env.PUBLIC_URL + '/logos/base_logo.svg'} width="40" height="40" />
              BASE ETH <br />
            </StackVerticalButton>
            &nbsp;&nbsp;
            <StackVerticalButton
              disabled={undefined}
              variant="contained"
              color="info"
              onClick={() => setIsFeeWarningOpen(true)}
            >
              <img src={process.env.PUBLIC_URL + '/logos/hl_sym.svg'} width="40" height="40" />
              HYPE <br />
            </StackVerticalButton>

            &nbsp;&nbsp;

            <StackVerticalButton
              variant="contained"
              onClick={() => {
                setPageState(PageState.CHECK_MEMBERSHIP);
              }}
            >
              <GroupsIcon style={{ fontSize: "50px" }} />
              MEMBERSHIP
            </StackVerticalButton>
            {advancedView && (
              <>
                &nbsp;&nbsp;
                <StackVerticalButton
                  variant="contained"
                  color="warning"
                  disabled={
                    machineState !== null &&
                    (machineState.isDepositInProgress ||
                      machineState.isEmptyingInProgress)
                  }
                  onClick={() =>
                    fetch(`${ATM_BACKEND_URL}/payout/empty`, { method: "POST" })
                  }
                >
                  <AirIcon style={{ fontSize: "50px" }} />
                  EMPTY PAYOUT
                </StackVerticalButton>
                &nbsp;&nbsp;
                <StackVerticalButton
                  variant="contained"
                  color="error"
                  onClick={() =>
                    fetch(`${ATM_BACKEND_URL}/machine/state/reset`, {
                      method: "POST",
                    })
                  }
                >
                  <RestartAltIcon style={{ fontSize: "50px" }} />
                  RESET MACHINE STATE
                </StackVerticalButton>
              </>
            )}
          </>
        )}
        {pageState === PageState.CHECK_MEMBERSHIP && (
          <Typography variant="h4">Please scan your FOB</Typography>
        )}
        {pageState === PageState.CHECK_MEMBERSHIP_SCANNED_FOB && (
          <>
            <Typography variant="h5">FOB ID: {keyFobId}</Typography>
            {fobUser === null && <CircularProgress />}
            {fobUser !== null && (
              <>
                {fobUser.name === null ? (
                  <Typography variant="h5">USER NOT REGISTERED</Typography>
                ) : (
                  <Typography variant="h5">
                    Name:&nbsp;{fobUser.name}
                  </Typography>
                )}
                {fobUser.expire_timestamp === null ? (
                  ""
                ) : (
                  <Typography variant="h5">
                    Expires:&nbsp;
                    {new Date(fobUser.expire_timestamp * 1000).toLocaleString()}
                  </Typography>
                )}
              </>
            )}
            {fobUser !== null &&
              fobUser.name !== null &&
              fobUser.expire_timestamp !== null && (
                <>
                  <StackVerticalButton
                    style={{ marginTop: "20px", height: "125px" }}
                    variant="contained"
                    onClick={() => {
                      setPageState(PageState.CHECK_MEMBERSHIP_INSERT_BILL);
                      fetch(`${ATM_BACKEND_URL}/deposit/start`, {
                        method: "POST",
                      }).catch((e) => {
                        alert(`Error occured ${e || "unknown"}`);
                      });
                    }}
                    color="success"
                  >
                    <LocalAtmIcon style={{ fontSize: "50px" }} />
                    PAY MEMBERSHIP FEES
                  </StackVerticalButton>
                </>
              )}
          </>
        )}
        {pageState === PageState.CHECK_MEMBERSHIP_INSERT_BILL &&
          fobUser !== null &&
          fobUser.name !== null &&
          fobUser.expire_timestamp !== null &&
          machineState !== null &&
          machineState.curMembershipTimeExtend !== null && (
            <>
              <Typography variant="h4">FEED BILLS INTO MACHINE</Typography>
              <Typography variant="h5">
                INSERTED CAD: $
                {machineState === null
                  ? "--"
                  : machineState.currentDeposit.toString()}
              </Typography>
              <Typography variant="h5">Name: {fobUser.name}</Typography>
              <Typography variant="h5">FOB Key: {keyFobId}</Typography>
              <Typography variant="h5">
                Expiry:{" "}
                {new Date(fobUser.expire_timestamp * 1000).toLocaleString()}
              </Typography>
              <Typography variant="h5">
                New Expiry:{" "}
                {machineState.currentDeposit <= 0
                  ? new Date(fobUser.expire_timestamp * 1000).toLocaleString()
                  : new Date(
                    ((fobUser.expire_timestamp < epochNowInSeconds()
                      ? epochNowInSeconds()
                      : fobUser.expire_timestamp) +
                      machineState.curMembershipTimeExtend) *
                    1000
                  ).toLocaleString()}
              </Typography>
              <br />
              <Button
                onClick={() => setIsDoneDepositingMembershipOpen(true)}
                variant="contained"
                color="success"
                style={{ height: "75px", fontSize: "15px" }}
              >
                <AttachMoneyIcon style={{ fontSize: "35px" }} />
                &nbsp;&nbsp;PROCEED&nbsp;&nbsp;
              </Button>
            </>
          )}
        {pageState === PageState.CHECK_MEMBERSHIP_EXTENDING && (
          <>
            <Typography variant="h4">Updating membership</Typography>
            <CircularProgress />
          </>
        )}
        {pageState === PageState.CHECK_MEMBERSHIP_EXTENDED_MEMBERSHIP && (
          <>
            <Typography variant="h4">Membership Updated!</Typography>
            {fobUser !== null &&
              fobUser.name !== null &&
              fobUser.expire_timestamp !== null && (
                <>
                  <Typography variant="h5">Name: {fobUser.name}</Typography>
                  <Typography variant="h5">FOB Key: {keyFobId}</Typography>
                  <Typography variant="h5">
                    New Expiry:{" "}
                    {new Date(fobUser.expire_timestamp * 1000).toLocaleString()}
                  </Typography>
                </>
              )}
          </>
        )}
        {pageState === PageState.BUYING_BITCOIN_SCAN_ADDRESS && (
          <>
            <div style={{ width: "400px", margin: "auto" }}>
              <Typography variant="h6">
                SCANNING LIGHTNING ADDRESS QR CODE
              </Typography>
              <QrReader
                ViewFinder={ViewFinder}
                videoId="video"
                scanDelay={500}
                constraints={{ facingMode: "user" }}
                onResult={(result, error) => {
                  if (!!result) {
                    let txt = result.getText();

                    // Is an address
                    if (txt.includes('@')) {
                      setQrCodeData(txt);
                      setIsConfirmAddressDialogOpen(true);
                    }
                  }

                  if (!!error) {
                    console.info("qr-code", error);
                  }
                }}
              />
              <div>Don't have a QR? Type a lightning address into the coinos.io/send page and press the QR button to generate a QR for any address</div>
            </div>
          </>
        )}
        {pageState === PageState.BUYING_POL_SCAN_ADDRESS && (
          <>
            <div style={{ width: "400px", margin: "auto" }}>
              <Typography variant="h6">
                SCANNING ETHEREUM ADDRESS QR CODE
              </Typography>
              <QrReader
                ViewFinder={ViewFinder}
                videoId="video"
                scanDelay={500}
                constraints={{ facingMode: "user" }}
                onResult={(result, error) => {
                  if (!!result) {
                    let txt = result.getText();

                    if (txt.startsWith("ethereum:")) {
                      try {
                        txt = txt.replace("ethereum:", "").slice(0, 42);
                      } catch (e) { }
                    }

                    // Is an address
                    if (txt.startsWith("0x") && txt.length === 42) {
                      setQrCodeData(txt);
                      setIsConfirmAddressDialogOpen(true);
                    }
                  }

                  if (!!error) {
                    console.info("qr-code", error);
                  }
                }}
              />
            </div>
          </>
        )}

        {pageState === PageState.BUYING_HYPE_SCAN_ADDRESS && (
          <>
            <div style={{ width: "400px", margin: "auto" }}>
              <Typography variant="h6">
                SCANNING ETHEREUM ADDRESS QR CODE ({nextPageState.data?.chain ? nextPageState.data?.chain.name : "l2 chain"})
              </Typography>
              <QrReader
                ViewFinder={ViewFinder}
                videoId="video"
                scanDelay={500}
                constraints={{ facingMode: "user" }}
                onResult={(result, error) => {
                  if (!!result) {
                    let txt = result.getText();

                    if (txt.startsWith("ethereum:")) {
                      try {
                        txt = txt.replace("ethereum:", "").slice(0, 42);
                      } catch (e) { }
                    }

                    // Is an address
                    if (txt.startsWith("0x") && txt.length === 42) {
                      setQrCodeData(txt);
                      setNextPageState({
                        state: PageState.BUYING_HYPE_INSERT_BILL,
                        nextState: PageState.BUYING_HYPE_SENDING_TX,
                        data: nextPageState.data
                      })
                      onAddressScanned(txt);
                      setIsConfirmAddressDialogOpen(true);
                    }
                  }

                  if (!!error) {
                    console.info("qr-code", error);
                  }
                }}
              />
            </div>
          </>
        )}
        {pageState === PageState.BUYING_L2_ETH_SCAN_ADDRESS && (
          <>
            <div style={{ width: "400px", margin: "auto" }}>
              <Typography variant="h6">
                SCANNING ETHEREUM ADDRESS QR CODE ({nextPageState.data?.chain ? nextPageState.data?.chain.name : "l2 chain"})
              </Typography>
              <QrReader
                ViewFinder={ViewFinder}
                videoId="video"
                scanDelay={500}
                constraints={{ facingMode: "user" }}
                onResult={(result, error) => {
                  if (!!result) {
                    let txt = result.getText();

                    if (txt.startsWith("ethereum:")) {
                      try {
                        txt = txt.replace("ethereum:", "").slice(0, 42);
                      } catch (e) { }
                    }

                    // Is an address
                    if (txt.startsWith("0x") && txt.length === 42) {
                      setQrCodeData(txt);
                      setNextPageState({
                        state: PageState.BUYING_L2_ETH_INSERT_BILL,
                        nextState: PageState.BUYING_L2_ETH_SENDING_TX,
                        data: nextPageState.data
                      })
                      setIsConfirmAddressDialogOpen(true);
                    }
                  }

                  if (!!error) {
                    console.info("qr-code", error);
                  }
                }}
              />
            </div>
          </>
        )}

        {pageState === PageState.BUYING_BITCOIN_INSERT_BILL && (
          <>
            <Typography variant="h5">FEED CAD BILLS INTO MACHINE</Typography>
            <Typography variant="subtitle1">
              Recipient address: {recipientAddress || "--"}
            </Typography>
            <div style={{ marginTop: "15px" }} />
            <Typography variant="h5">
              INSERTED CAD: $
              {machineState === null
                ? "--"
                : machineState.currentDeposit.toString()}
            </Typography>
            <Typography variant="h5">
              BITCOIN TO RECEIVE: ~
              {machineState !== null
                ? prettyNumbers(machineState.currentBtcToRecv)
                : "--"}
            </Typography>
            <StackVerticalButton
              style={{ marginTop: "20px", height: "125px" }}
              variant="contained"
              onClick={() => {
                setIsDoneDepositingBtcOpen(true);
              }}
              color="success"
            >
              <ThumbUpOffAltIcon style={{ fontSize: "50px" }} />
              DONE
            </StackVerticalButton>
          </>
        )}
        {pageState === PageState.BUYING_HYPE_INSERT_BILL && (
          <>

            <Typography variant="h5" color="primary" fontWeight="bold"
              sx={{ backgroundColor: 'rgba(255, 60, 0, 0.1)', padding: '10px', borderRadius: '5px' }}
            >
              HYPE L1 may charge a 1 USD fee when depositing to new accounts.
            </Typography>

            <div style={{ marginTop: "15px" }} />
            <Typography variant="h5">

              FEED CAD BILLS INTO MACHINE
            </Typography>
            <Typography variant="subtitle1">
              Recipient address: {recipientAddress || "--"}
            </Typography>

            {recipientHLName && (
              <Typography variant="subtitle1">
                Recipient HL Name: {recipientHLName}
              </Typography>
            )}
            <div style={{ marginTop: "15px" }} />

            <Typography variant="h5">
              INSERTED CAD: $
              {machineState === null
                ? "--"
                : machineState.currentDeposit.toString()}
            </Typography>
            <Typography variant="h5">
              {nextPageState.data.chain.tsym} TO RECEIVE: ~
              {machineState !== null
                ? prettyNumbers(machineState.currentHypeToRecv)
                : "--"}
            </Typography>
            <StackVerticalButton
              style={{ marginTop: "20px", height: "125px" }}
              variant="contained"
              onClick={() => {
                setIsDoneDepositingOpen(true);
              }}
              color="success"
            >
              <ThumbUpOffAltIcon style={{ fontSize: "50px" }} />
              DONE
            </StackVerticalButton>
          </>
        )}
        {pageState === PageState.BUYING_L2_ETH_INSERT_BILL && (
          <>
            <Typography variant="h5">FEED CAD BILLS INTO MACHINE</Typography>
            <Typography variant="subtitle1">
              Recipient address: {recipientAddress || "--"}
            </Typography>
            <div style={{ marginTop: "15px" }} />
            <Typography variant="h5">
              INSERTED CAD: $
              {machineState === null
                ? "--"
                : machineState.currentDeposit.toString()}
            </Typography>
            <Typography variant="h5">
              {nextPageState?.data?.chain ? `${nextPageState.data.chain.name} ETH` : "ETH"} TO RECEIVE: ~
              {machineState !== null
                ? prettyNumbers(machineState.currentL2EthToRecv)
                : "--"}
            </Typography>
            <StackVerticalButton
              style={{ marginTop: "20px", height: "125px" }}
              variant="contained"
              onClick={() => {
                setIsDoneDepositingOpen(true);
              }}
              color="success"
            >
              <ThumbUpOffAltIcon style={{ fontSize: "50px" }} />
              DONE
            </StackVerticalButton>
          </>
        )}

        {pageState === PageState.BUYING_POL_INSERT_BILL && (
          <>
            <Typography variant="h5">FEED CAD BILLS INTO MACHINE</Typography>
            <Typography variant="subtitle1">
              Recipient address: {recipientAddress || "--"}
            </Typography>
            <div style={{ marginTop: "15px" }} />
            <Typography variant="h5">
              INSERTED CAD: $
              {machineState === null
                ? "--"
                : machineState.currentDeposit.toString()}
            </Typography>
            <Typography variant="h5">
              POL TO RECEIVE: ~
              {machineState !== null
                ? prettyNumbers(machineState.currentPolToRecv)
                : "--"}
            </Typography>
            <StackVerticalButton
              style={{ marginTop: "20px", height: "125px" }}
              variant="contained"
              onClick={() => {
                setIsDoneDepositingOpen(true);
              }}
              color="success"
            >
              <ThumbUpOffAltIcon style={{ fontSize: "50px" }} />
              DONE
            </StackVerticalButton>
          </>
        )}
        {pageState === PageState.BUYING_POL_SENDING_TX && (
          <>
            <Typography variant="h5">
              CONFIRMING DEPOSIT AND SENDING POL...
            </Typography>
            <CircularProgress />
          </>
        )}
        {pageState === PageState.BUYING_L2_ETH_SENDING_TX && (
          <>
            <Typography variant="h5">
              CONFIRMING DEPOSIT AND SENDING {nextPageState.data?.chain ? `${nextPageState.data?.chain.name} ETH` : "ETH"}...
            </Typography>
            <CircularProgress />
          </>
        )}
        {pageState === PageState.BUYING_HYPE_SENDING_TX && (
          <>
            <Typography variant="h5">
              CONFIRMING DEPOSIT AND SENDING HYPE...
            </Typography>
            <CircularProgress />
          </>
        )}
        {pageState === PageState.BUYING_BITCOIN_TX_RECEIPT && (
          <>
            <div style={{ maxWidth: "400px", wordBreak: "break-all" }}>
              <Typography variant="h5">BITCOIN SENT</Typography>
              <Typography variant="subtitle1">
                Transaction Hash:{" "}
                {finishDepositResp !== null ? finishDepositResp.txHash : "--"}
                <br /><br />
              </Typography>
              <Typography variant="subtitle1">
                Deposited CAD:{" "}
                {finishDepositResp !== null
                  ? prettyNumbers(finishDepositResp.totalDepositCAD)
                  : "--"}
              </Typography>
              <Typography variant="subtitle1">
                Received BITCOIN:{" "}
                {finishDepositResp !== null
                  ? prettyNumbers(finishDepositResp.totalCryptoToRecv)
                  : "--"}
              </Typography>
            </div>
          </>
        )}

        {pageState === PageState.BUYING_L2_ETH_TX_RECEIPT && (
          <>
            <Typography variant="h5">{nextPageState.data?.chain.name} ETH SENT</Typography>
            <Typography variant="subtitle1">
              Transaction Hash:{" "}
              {finishDepositResp !== null ? finishDepositResp.txHash : "--"}
            </Typography>
            <Typography variant="subtitle1">
              Deposited CAD:{" "}
              {finishDepositResp !== null
                ? prettyNumbers(finishDepositResp.totalDepositCAD)
                : "--"}
            </Typography>
            <Typography variant="subtitle1">
              Received ETH:{" "}
              {finishDepositResp !== null
                ? prettyNumbers(finishDepositResp.totalCryptoToRecv)
                : "--"}
            </Typography>
            {finishDepositResp?.explorerTx && (
              <QRCode
                value={finishDepositResp.explorerTx}
              />)
            }
          </>
        )}
        {pageState === PageState.BUYING_HYPE_TX_RECEIPT && (
          <>
            <Typography variant="h5">HYPE SENT</Typography>
            <Typography variant="subtitle1">
              Deposited CAD:{" "}
              {finishDepositResp !== null
                ? prettyNumbers(finishDepositResp.totalDepositCAD)
                : "--"}
            </Typography>
            <Typography variant="subtitle1">
              Received HYPE:{" "}
              {finishDepositResp !== null
                ? prettyNumbers(finishDepositResp.totalCryptoToRecv)
                : "--"}
            </Typography>
            {finishDepositResp?.recipientPrimaryName && (
              <Typography variant="subtitle1">
                Recipient HL Name: {finishDepositResp.recipientPrimaryName}
              </Typography>)
            }
            {finishDepositResp?.explorerTx && (
              <QRCode
                value={finishDepositResp.explorerTx}
              />)
            }
          </>
        )}
        {pageState === PageState.BUYING_POL_TX_RECEIPT && (
          <>
            <Typography variant="h5">POL SENT</Typography>
            <Typography variant="subtitle1">
              Transaction Hash:{" "}
              {finishDepositResp !== null ? finishDepositResp.txHash : "--"}
            </Typography>
            <Typography variant="subtitle1">
              Deposited CAD:{" "}
              {finishDepositResp !== null
                ? prettyNumbers(finishDepositResp.totalDepositCAD)
                : "--"}
            </Typography>
            <Typography variant="subtitle1">
              Received POL:{" "}
              {finishDepositResp !== null
                ? prettyNumbers(finishDepositResp.totalCryptoToRecv)
                : "--"}
            </Typography>
            {finishDepositResp?.explorerTx && (
              <QRCode
                value={finishDepositResp.explorerTx}
              />)
            }
          </>
        )}
      </Grid>
      <Grid
        container
        spacing={0}
        direction="column"
        alignItems="center"
        justifyContent="center"
        style={{ minHeight: "25vh" }}
      >
        {pageState !== PageState.MAIN && (
          <Button
            onClick={() => setIsReturnDialogOpen(true)}
            variant="contained"
            color="error"
            style={{ height: "75px", fontSize: "15px" }}
          >
            <CancelIcon style={{ fontSize: "35px" }} />
            &nbsp;&nbsp;RETURN HOME
          </Button>
        )}
      </Grid>
    </>
  );
}

export default App;
