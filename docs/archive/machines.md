# 采集机身份对照（归档）

> 2026-11-13 从 `docs/launch-runbook.md` 移入。运维时如仍需对照设备身份，以
> `GET /api/functions/token-usage-dashboard?range=all_time`（设备令牌即可读）为准；
> 本表只记录归档时的快照。

文档里用「家机 / 公司机」指代采集机。设备名分两个：

- **默认名**（稳定标识）：契约 §2.2 规定的 `<主机名> #<machine_id 前 8 位>`，签发时生成、
  不随改名更新。CLI 的 `status` / `doctor` / `sync` 输出的 `- Device:` 行即默认名。
- **云端当前名**：操作者可在仪表盘改名。

| 别名 | 云端当前名 | 默认名（稳定标识） | device_id | 数据目录 |
| --- | --- | --- | --- | --- |
| 家机 | `Home · C Future City` | `DESKTOP-MHFON1J #48ea790e` | `6a074a51-693b-48e3-9f65-0728f9f2ee5c` | `C:\Users\i\.tokenusage` |
| 公司机 | `Company · Partner` | `PC-20260408RIKF #68e47b34` | `1bd2ff67-653f-4b9c-80a9-c7589432d431` | `C:\Users\Administrator\.tokenusage` |

每个账号还有账户级来源 `cursor`（跨设备去重，不计入任一设备行）。

历史记录中的机器归属更正、各版本升级与对账结果（含「标 Volta 的家机行实为公司机」的更正）见
`docs/archive/cli-releases.md` 与其开头的「机器称呼约定」。
