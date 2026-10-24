// Login page copy (email+password / magic link, callback error rendering).

export interface LoginCopy {
  pageTitle: string;
  pageSubtitle: string;
  passwordMode: string;
  magicMode: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  passwordSubmit: string;
  magicSubmit: string;
  magicHint: string;
  sentTitle: string;
  sentBody: string;
  sentResend: string;
  sentBack: string;
  errorInvalidCredentials: string;
  errorRateLimited: string;
  errorCallback: string;
  errorGeneric: string;
  backToLanding: string;
}

export const LOGIN_COPY: Record<"zh" | "en", LoginCopy> = {
  zh: {
    pageTitle: "登录",
    pageSubtitle: "使用管理员为你开通的账号登录 Token Usage。",
    passwordMode: "密码登录",
    magicMode: "魔法链接",
    emailLabel: "邮箱",
    emailPlaceholder: "you@example.com",
    passwordLabel: "密码",
    passwordPlaceholder: "管理员下发的临时密码",
    passwordSubmit: "登录",
    magicSubmit: "发送魔法链接",
    magicHint:
      "我们将向你的邮箱发送一封一次性登录邮件，点击其中的链接即可完成登录。",
    sentTitle: "魔法链接已发送",
    sentBody:
      "请查收邮箱，点击邮件中的链接完成登录。链接有效期有限，请尽快使用。",
    sentResend: "重新发送",
    sentBack: "返回重新填写",
    errorInvalidCredentials: "邮箱或密码错误。",
    errorRateLimited: "尝试过于频繁，请稍后再试。",
    errorCallback: "登录链接无效或已过期，请重新登录。",
    errorGeneric: "登录失败，请稍后再试。",
    backToLanding: "返回首页",
  },
  en: {
    pageTitle: "Sign in",
    pageSubtitle: "Sign in to Token Usage with the account your admin created.",
    passwordMode: "Password",
    magicMode: "Magic link",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Temporary password from your admin",
    passwordSubmit: "Sign in",
    magicSubmit: "Send magic link",
    magicHint:
      "We'll email you a one-time sign-in link. Open it to complete the sign-in.",
    sentTitle: "Magic link sent",
    sentBody:
      "Check your inbox and open the link to finish signing in. The link expires, so use it soon.",
    sentResend: "Resend",
    sentBack: "Edit email",
    errorInvalidCredentials: "Wrong email or password.",
    errorRateLimited: "Too many attempts — try again shortly.",
    errorCallback:
      "That sign-in link is invalid or expired. Please sign in again.",
    errorGeneric: "Sign-in failed. Please try again later.",
    backToLanding: "Back to home",
  },
};
