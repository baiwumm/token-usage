// Device pairing page copy (/device — part of the CLI contract, §1.1: the
// CLI prints and opens /device?user_code=XXXX-XXXX).

export interface DeviceCopy {
  pageTitle: string;
  pageSubtitle: string;
  manualTitle: string;
  manualHint: string;
  codeLabel: string;
  codePlaceholder: string;
  confirmTitle: string;
  confirmBody: string;
  approve: string;
  approving: string;
  successTitle: string;
  successBody: string;
  errorTitle: string;
  errorInvalid: string;
  errorNotFound: string;
  errorGeneric: string;
  retry: string;
  startOver: string;
}

export const DEVICE_COPY: Record<"zh" | "en", DeviceCopy> = {
  zh: {
    pageTitle: "设备配对",
    pageSubtitle: "批准采集端 CLI 的配对请求，批准后令牌只显示在 CLI 侧。",
    manualTitle: "输入配对码",
    manualHint: "在采集机上运行配对命令后，把打印的配对码填到这里。",
    codeLabel: "配对码",
    codePlaceholder: "XXXX-XXXX",
    confirmTitle: "确认配对请求",
    confirmBody:
      "以下配对码来自你的采集端 CLI。批准后，该 CLI 将获得本账户的上报令牌。",
    approve: "批准配对",
    approving: "批准中…",
    successTitle: "配对成功",
    successBody: "设备已批准。回到采集端 CLI，令牌会自动下发并开始上报。",
    errorTitle: "配对失败",
    errorInvalid: "配对码格式不正确。",
    errorNotFound: "配对码不存在、已过期或已被使用。请在采集端重新发起配对。",
    errorGeneric: "配对请求失败，请稍后再试。",
    retry: "重试",
    startOver: "输入其他配对码",
  },
  en: {
    pageTitle: "Device pairing",
    pageSubtitle:
      "Approve the collector CLI's pairing request — the token is only ever shown on the CLI side.",
    manualTitle: "Enter a pairing code",
    manualHint:
      "Run the pairing command on your collector and type the printed code here.",
    codeLabel: "Pairing code",
    codePlaceholder: "XXXX-XXXX",
    confirmTitle: "Confirm pairing request",
    confirmBody:
      "This code comes from your collector CLI. Approving grants it a reporting token for your account.",
    approve: "Approve pairing",
    approving: "Approving…",
    successTitle: "Paired",
    successBody:
      "The device is approved. Back in the collector CLI, the token arrives automatically and reporting starts.",
    errorTitle: "Pairing failed",
    errorInvalid: "That pairing code is malformed.",
    errorNotFound:
      "The code does not exist, has expired, or was already used. Start a new pairing on the collector.",
    errorGeneric: "The pairing request failed. Try again shortly.",
    retry: "Retry",
    startOver: "Enter another code",
  },
};
