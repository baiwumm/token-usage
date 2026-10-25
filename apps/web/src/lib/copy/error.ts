// Error boundary copy (src/app/error.tsx). Bilingual via the shared locale
// provider; the boundary renders inside the root layout so useLocale works.

export interface ErrorCopy {
  title: string;
  description: string;
  digestLabel: string;
  retry: string;
  goHome: string;
}

export const ERROR_COPY: Record<"zh" | "en", ErrorCopy> = {
  zh: {
    title: "出错了",
    description:
      "页面发生了意外错误。可以重试一次；如果反复出现，请携带下方错误编号反馈。",
    digestLabel: "错误编号",
    retry: "重试",
    goHome: "返回首页",
  },
  en: {
    title: "Something went wrong",
    description:
      "An unexpected error occurred. Try again — if it keeps happening, please report it with the error ID below.",
    digestLabel: "Error ID",
    retry: "Retry",
    goHome: "Go home",
  },
};
