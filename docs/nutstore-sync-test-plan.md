# 坚果云 WebDAV 同步测试流程

> 适用：`dsh-csrw` 的 `dsh_csrw_nutstore_*` 工具与设置页「坚果云」卡片。
> 目标：覆盖配置校验、首次全量、增量、冲突、网络中断、大文件/特殊字符、权限异常，并给出可验收标准。

## 一、前置准备

| 项 | 要求 |
| --- | --- |
| 账号 | 坚果云账号 + **应用密码**（WebDAV 专用，不是登录密码） |
| 凭据 | 通过 DSH 凭据存储（`api-key`）或 `NUTSTORE_USERNAME` / `NUTSTORE_PASSWORD` 环境变量提供，**不在界面录入** |
| 远端 | 一个空目录作为测试根（`remoteRoot`，默认 `dsh-csrw`） |
| 本地 | 一个独立测试目录（不要用真实工作区） |
| 网络 | 可正常访问 `https://dav.jianguoyun.com/dav/` |

**测试隔离**：每次用例使用独立 `remoteRoot` 子目录（如 `dsh-csrw-test-<日期>`），避免污染正式数据。

## 二、用例清单

### TC-01 配置校验

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 不配置任何凭据，调 `nutstore_test` | 报错含 `auth-missing`，提示配置凭据 | 错误信息包含「DSH 凭据存储」或「NUTSTORE_USERNAME」关键字 |
| 2. 配置错误应用密码，调 `nutstore_test` | 报错含 `auth-failed`（HTTP 401） | 提示「账号或应用密码错误」 |
| 3. 配置错误 `baseUrl`（如 `https://dav.example.com/`） | 报错含 `network` 或 `not-found` | 提示「网络不可达」或「远端目录不存在」 |
| 4. 配置 `remoteRoot` 含 `..`（如 `a/../b`） | 报错含 `invalid-path` | 拒绝同步，提示「相对子路径」 |
| 5. 正确配置，调 `nutstore_test` | `connected:true`、`remoteRootExists` 正确、有 `latencyMs` | 返回 `status: 207`（或 404 表示根不存在） |

### TC-02 首次全量同步（push）

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 本地准备 10 个文件（含子目录） | — | — |
| 2. 空远端，调 `nutstore_push`（localPath=测试目录，remotePath=测试子目录） | 10 个全部进 `transferred`，`skipped`/`conflicts` 为空 | `transferred.length === 10` |
| 3. 调 `nutstore_list` 检查远端 | 远端文件数与本地一致，目录结构一致 | 远端文件数 = 本地文件数 |
| 4. 抽查 1 个文件内容 | 内容与本地完全一致 | SHA-256 一致（工具上传后会做校验） |
| 5. 检查 `.dsh-csrw/sync/*.json` | 生成同步基线 | 文件存在且包含 10 条路径哈希 |

### TC-03 增量同步（push）

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 不改任何文件，再次 `nutstore_push` | 全部 `skipped`，0 传输 | `transferred.length === 0` |
| 2. 修改 1 个文件内容，再 push | 只有该文件 `transferred`，其余 `skipped` | `transferred.length === 1` |
| 3. 新增 1 个文件，再 push | 新文件 `transferred`，其余 `skipped` | `transferred` 只含新文件 |
| 4. 删除本地 1 个文件（不带 `prune`），再 push | 远端保留该文件，`deletionsPropagated:false` | 远端文件数不变 |

### TC-04 下载（pull）

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 远端新增 1 个文件，调 `nutstore_pull` | 本地出现该文件 | 内容与远端一致 |
| 2. 本地已有且未改，再 pull | 全部 `skipped` | `transferred.length === 0` |
| 3. 远端删除 1 个文件，再 pull | 本地保留该文件（不传播删除） | 本地文件数不变 |

### TC-05 冲突场景

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 同步一次建立基线后，**本地和远端同时修改同一文件** | push 时该文件进 `conflicts` | `conflicts.length === 1` |
| 2. 检查本地目录 | 生成 `<name>.local` 和 `<name>.remote` 两份副本，主文件未被覆盖 | 两个副本内容分别等于本地/远端版本 |
| 3. 再次 push | 仍保留副本，不静默覆盖 | 主文件内容不变，副本存在 |
| 4. 人工合并后删除副本，再 push | 该文件正常 `transferred` | 冲突解除 |

### TC-06 网络中断与恢复

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 同步进行中断网 | 报错含 `network`，已传文件不回滚 | 错误提示可重试 |
| 2. 恢复网络后重跑 | 已传文件 `skipped`，未传文件继续 | 最终全部同步成功 |
| 3. 用 `nutstore_logs` 查看 | 有失败记录 + 后续成功记录 | 日志条数 ≥ 2，含 `direction` 与计数 |

### TC-07 大文件与特殊字符文件名

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 上传 > 32 MiB 文件 | 报错含 `too-large` | 提示「32 MiB 单文件上限」 |
| 2. 上传中文文件名（如 `论文笔记.md`） | 成功，远端文件名正确 | `nutstore_list` 返回中文名，无乱码 |
| 3. 上传含空格/括号/`#`/`&` 的文件名 | 成功，URL 编码正确 | 远端可列出且内容一致 |
| 4. 上传 emoji 文件名 | 成功或明确报错（视服务器） | 不出现静默丢文件 |

### TC-08 权限异常

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 只读远端目录（如坚果云只读共享） | 报错含 `forbidden`（403） | 提示「无权限访问该目录」 |
| 2. 远端根不存在时 push | 自动创建目录并成功 | `remoteRootExists` 变为 true |
| 3. 远端根不存在时 list | 返回 404 语义，不崩溃 | 错误可读，不抛未捕获异常 |

### TC-09 删除

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. `nutstore_delete` 不传 `confirm` | 拒绝执行 | 报错「Delete requires confirm:true」 |
| 2. `nutstore_delete` 传 `confirm:true` 删除指定文件 | 删除成功，`found:true` | `nutstore_list` 不再包含该文件 |
| 3. 删除不存在的文件 | `found:false`，不报错 | `status: 404` |
| 4. 删除远端根（`remotePath` 为空） | 拒绝 | 报错「Refusing to delete the configured remote root」 |
| 5. `nutstore_push` 带 `prune:true` 但无 `confirm` | 拒绝 | 报错「prune requires confirm:true」 |
| 6. `prune:true + confirm:true` | 删除远端多余文件 | `pruned` 非空，远端与本地一致 |

### TC-10 日志与反馈

| 步骤 | 预期结果 | 验收标准 |
| --- | --- | --- |
| 1. 任意一次 push 后调 `nutstore_logs` | 返回最近记录 | 包含 `direction/transferred/skipped/conflicts/pruned` |
| 2. 失败后调 `nutstore_logs` | 能看到失败前记录 | 日志文件 `.dsh-csrw/logs/nutstore.log` 存在 |
| 3. UI 结果卡片 | 显示同步结果 JSON | `transferred/skipped/conflicts` 可见 |

## 三、自动化测试对照

| 用例 | 现有自动化 | 说明 |
| --- | --- | --- |
| TC-01 配置校验 | `test/nutstore.test.js`（mock DAV 401/403） | 认证失败、列表过滤 |
| TC-02 首次全量 | `test/nutstore.test.js`（DAV roundtrip） | 首次 push/pull 全量 |
| TC-03 增量 | `test/nutstore.test.js`（`skipped` 断言） | 二次 push 跳过 |
| TC-05 冲突 | `test/nutstore.test.js`（`conflicts` + `.local/.remote`） | 双向冲突副本 |
| TC-06 重试 | `test/retry.test.js` | 网络错误重试、4xx 不重试 |
| TC-07 特殊字符 | 需手工（mock 未覆盖） | 建议补 1 个编码用例 |
| TC-08 权限 | 需手工 | mock 403 已有部分覆盖 |

**手工验收补充**：TC-07 的 emoji/特殊字符、TC-08 的只读共享、TC-09 的真实删除，需在坚果云测试目录手工跑一遍。

## 四、回归清单（每次改动后）

- [ ] `npm test` 全绿（含 `nutstore.test.js` / `retry.test.js`）
- [ ] `npm run check` 工具数与标识一致
- [ ] `nutstore_test` 在真实账号下返回 `connected:true`
- [ ] 一次 push + 一次 pull 无冲突、无报错
- [ ] `nutstore_logs` 有对应记录

## 五、验收标准汇总

| 维度 | 通过标准 |
| --- | --- |
| 正确性 | 远端与本地文件内容 SHA-256 一致 |
| 完整性 | 全量同步后文件数/目录结构一致 |
| 增量性 | 未变文件不重复传输 |
| 安全性 | 冲突保留副本、删除需显式确认、凭据不出现在日志 |
| 可恢复性 | 网络恢复后重跑幂等，不丢文件 |
| 可观测性 | 每次同步有结果 JSON + 日志记录 |
