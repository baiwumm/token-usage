import type { MDXComponents } from "mdx/types";

import { Card, Cards } from "fumadocs-ui/components/card";
import { Callout } from "fumadocs-ui/components/callout";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";

/**
 * MDX 可用组件白名单
 *
 * 文档正文只允许使用这里注册的组件——内容真源在本站 `src/content/docs/`，
 * 保持组件面收窄，避免顺手引入未审查的第三方组件。
 * img 显式映射为原生 <img>：文档里引用了操作者实例的徽章外链，next/image
 * 需要 remotePatterns 白名单，静态导出场景不值得。
 */
export function getMDXComponents(
  components: MDXComponents = {},
): MDXComponents {
  return {
    ...defaultMdxComponents,
    // 原生 <img>：透传 MDX 里的 alt；外链徽章 URL 过不了 next/image 的
    // remotePatterns，静态导出不值得为此配白名单。
    // src 兼容两种形态：markdown 图片经 fumadocs 的 remark-image 处理后是
    // { src: string } 对象，原生 HTML img 是字符串——统一解包成字符串。
    img: (props) => {
      const src =
        typeof props.src === "string"
          ? props.src
          : ((props.src as { src?: string } | undefined)?.src ?? "");

      // eslint-disable-next-line @next/next/no-img-element -- alt 由 MDX 调用方透传
      return <img alt="" {...props} src={src} />;
    },
    Card,
    Cards,
    Callout,
    Steps,
    Step,
    Tabs,
    Tab,
    ...components,
  };
}
