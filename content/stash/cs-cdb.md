---
title: cs-cdb
description: cheat sheet for cdb
---

# CDB 分析 Dump 速查手册

> 适用：Windows 用户态 dump（`.dmp` / `.mdmp`）与内核 dump；`cdb.exe` 来自 Windows SDK 的 Debugging Tools for Windows。
> 说明：CDB 与 WinDbg 共用同一调试引擎和命令语言，本文以命令行 `cdb` 为主，WinDbg 同样适用。
> 标记：⚠️ 高频易错；★ 常用命令；所有示例中的路径、地址、模块名请替换成你自己的。

## 目录

0. 10 分钟上手
1. 安装、启动与命令行
2. 符号：分析的生命线
3. 命令体系与表达式
4. 打开 dump 后的第一组命令
5. 读 `!analyze -v`
6. 线程与上下文
7. 栈：k / kb / kv / kn
8. 模块与符号核对
9. 内存、地址与搜索
10. 寄存器、反汇编、类型
11. 用户态专项
12. 内核 dump 专项
13. .NET / 托管代码
14. 崩溃类型与定位套路
15. 死锁、挂起、高 CPU
16. 生成 dump
17. 脚本与批处理
18. 常见错误与坑
19. 命令速查表
20. 练习与自测

---

## 0. 10 分钟上手

### 0.1 最小命令序列

```bat
cdb -z C:\dumps\app.dmp -y srv*C:\Symbols*https://msdl.microsoft.com/download/symbols
```

进入 `0:000>` 提示符后：

```text
.symfix
.reload
!analyze -v
.ecxr
kv
lm
~*k
q
```

**每一步在干什么**

| 命令 | 作用 |
|---|---|
| `.symfix` | 把符号路径设为微软公共符号服务器（带本地缓存） |
| `.reload` | 按新路径重新加载模块符号 |
| `!analyze -v` | 自动异常/崩溃分析，给出第一线索 |
| `.ecxr` | 把上下文切到“异常发生时的线程和寄存器” |
| `kv` | 看当前线程带帧信息的栈 |
| `lm` | 看模块列表，确认版本与符号 |
| `~*k` | 看所有线程的栈（死锁、挂起必看） |
| `q` | 退出 |

### 0.2 三条铁律

1. **先符号，后分析**：没有符号的 `!analyze -v` 基本等于猜。
2. **先 `.ecxr`，后看栈**：不切异常上下文，看到的可能不是崩溃现场。
3. **`!analyze -v` 是线索，不是结论**：“Probably caused by” 经常是受害者，不是元凶。

### 0.3 按症状查

| 症状 | 先跑这些 |
|---|---|
| 程序崩溃 / 闪退 | `!analyze -v` → `.ecxr` → `kv` → `lm` |
| 卡死 / 无响应 | `!analyze -hang` → `~*k` → `!cs -l` |
| 内存持续上涨 | `!address -summary` → `!heap -s` |
| 句柄泄漏 | `!handle 0 f` |
| 蓝屏 / 重启 | `!analyze -v` → `.bugcheck` → `lm` |
| 驱动相关蓝屏 | `!analyze -v` → `!drvobj` → `!devobj` → `!irp` |
| .NET 异常 | `.loadby sos clr` → `!pe` → `!clrstack` |
| 怀疑代码被改 | `!chkimg -d 模块名` |

> 一句话：**符号 → 异常 → 线程 → 栈 → 模块 → 内存，按这个顺序排查，不要一上来就盯着 `!analyze` 的 “Probably caused by”。**

---

## 1. 安装、启动与命令行

### 1.1 安装

- 安装 **Windows SDK**，勾选 **Debugging Tools for Windows**。
- 典型路径：

```text
C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\cdb.exe
C:\Program Files (x86)\Windows Kits\10\Debuggers\x86\cdb.exe
```

- 新版 WinDbg（WinDbgX）也自带调试引擎，但命令行 `cdb.exe` 仍以 SDK 版本最稳妥。
- 把对应目录加入 `PATH`，或直接用全路径。

### 1.2 位数必须匹配

| Dump 来源 | 推荐调试器 |
|---|---|
| 64 位进程 | `x64\cdb.exe` |
| 32 位进程 | `x86\cdb.exe` |
| WOW64（32 位进程跑在 64 位系统） | 优先 `x86`；`x64` 也能看，但栈/上下文可能不完整 |
| 内核 dump | 与目标系统位数一致 |

⚠️ 用错位数最常见的现象：模块列表不全、栈乱、`!analyze` 报奇怪的 “Unknown_Image”。

### 1.3 命令行参数

| 参数 | 作用 | 示例 |
|---|---|---|
| `-z <file>` | 打开 dump 文件 | `cdb -z app.dmp` |
| `-c "<cmd>"` | 启动后执行命令，分号分隔 | `-c ".symfix; .reload; !analyze -v; q"` |
| `-y <path>` | 指定符号路径 | `-y srv*C:\Symbols*https://msdl.microsoft.com/download/symbols` |
| `-i <path>` | 指定可执行文件/镜像搜索路径 | `-i C:\app\bin` |
| `-lines` | 启用源行信息 | `-lines` |
| `-srcpath <path>` | 源码路径 | `-srcpath C:\src` |
| `-logo <file>` | 把会话输出写入日志 | `-logo cdb.log` |
| `-p <pid>` | 附加到进程（live） | `cdb -p 1234` |
| `-pn <name>` | 按进程名附加（live） | `cdb -pn app.exe` |
| `-g` | 忽略初始断点 | 一般用于 live |
| `-G` | 忽略最终断点 | 一般用于 live |
| `-o` | 调试子进程 | live |
| `-v` | 详细输出 | 排错 |
| `-server` / `-premote` | 远程调试 | 进阶 |

### 1.4 启动示例

```bat
:: 打开 dump，执行分析后退出
cdb -z C:\dumps\app.dmp -c "!analyze -v; q"

:: 指定符号与镜像路径
cdb -z C:\dumps\app.dmp ^
    -y "srv*C:\Symbols*https://msdl.microsoft.com/download/symbols" ^
    -i "C:\app\bin" -lines

:: 附加到进程并抓 full dump
cdb -p 1234 -c ".dump /ma C:\dumps\app.dmp; q"

:: 按进程名附加并抓 dump
cdb -pn app.exe -c ".dump /ma C:\dumps\app.dmp; q"
```

### 1.5 交互基础

- 提示符 `0:000>`：前面是进程号，后面是线程号。
- `q` 退出调试会话；dump 分析中直接 `q` 即可。
- `Ctrl+Break` 中断正在运行的目标（live）。
- **dump 是静态快照**：`g` 只会跑到结束，`p` / `t` 不会真的单步执行崩溃程序；断点对 dump 分析基本无用。

> 一句话：**cdb 打开 dump 后就是“验尸”，不是“复活”；所有命令都是只读检查。**

---

## 2. 符号：分析的生命线

### 2.1 符号路径

推荐环境变量：

```bat
set _NT_SYMBOL_PATH=srv*C:\Symbols*https://msdl.microsoft.com/download/symbols
```

含义：`srv*本地缓存*符号服务器`。第一次下载后缓存到 `C:\Symbols`，之后离线也能用。

私有符号可追加：

```bat
set _NT_SYMBOL_PATH=C:\PrivateSymbols;srv*C:\Symbols*https://msdl.microsoft.com/download/symbols
```

### 2.2 `.symfix` 与 `.sympath`

| 命令 | 作用 |
|---|---|
| `.symfix` | 设为微软公共符号服务器 + 默认缓存 |
| `.symfix C:\Symbols` | 指定本地缓存目录 |
| `.symfix+ C:\Symbols` | 追加到现有路径 |
| `.sympath` | 显示当前符号路径 |
| `.sympath srv*C:\Symbols*https://msdl.microsoft.com/download/symbols` | 手动设置 |
| `.exepath C:\app\bin` | 指定可执行文件搜索路径 |

### 2.3 `.reload`

| 命令 | 作用 |
|---|---|
| `.reload` | 按当前符号路径重新加载（延迟加载） |
| `.reload /f` | 强制立即加载所有模块符号 |
| `.reload /f app.exe` | 只强制加载某个模块 |

### 2.4 诊断符号问题

```text
!sym noisy
.reload /f
!sym quiet
```

- `!sym noisy` 会打印每个 PDB 的查找路径、下载结果、校验失败原因。
- 看完记得 `!sym quiet`，否则输出很吵。
- `.symopt+ 0x80000000` 也能打开符号调试输出（`SYMOPT_DEBUG`）。

### 2.5 常见符号状态

| 现象 | 含义 | 处理 |
|---|---|---|
| `Symbols loaded` | 正常 | 继续 |
| `Symbol file could not be found` | 没找到 PDB | 检查路径/网络/缓存 |
| `Mismatched PDB` | PDB 与二进制不匹配 | 找对应版本 PDB |
| `Unable to load image` | 找不到二进制 | `-i` / `.exepath` 指定路径 |
| `WRONG SYMBOL` | 符号与模块不匹配 | 清理错误 PDB，重新加载 |
| `Unknown_Image` | 无符号，只能看地址 | 补符号或看反汇编 |

### 2.6 核对 PDB 与镜像

```text
lmv
!lmi app
```

重点看：

- `Timestamp`：编译时间。
- `Image size`：镜像大小。
- `Symbol Type`：`PDB` / `Export` / `None`。
- `PDB signature`：GUID + Age。
- `Image path`：实际加载路径。

⚠️ dump 里的模块版本、PDB、二进制三者必须来自同一次构建；版本错一位，栈和结构体都可能错。

批量校验一个目录：

```bat
symchk /r C:\app\bin /s srv*C:\Symbols*https://msdl.microsoft.com/download/symbols
```

> 一句话：**符号不对，一切白费；先 `!sym noisy` 看它到底在找哪个 PDB。**

---

## 3. 命令体系与表达式

### 3.1 三类命令

| 类别 | 特征 | 例子 |
|---|---|---|
| 内置命令 | 没有前缀 | `k`、`u`、`r`、`d`、`s`、`x`、`ln`、`bp`、`g`、`q` |
| 点命令 | `.` 开头，调试器自身功能 | `.symfix`、`.reload`、`.ecxr`、`.frame`、`.dump`、`.logopen` |
| 扩展命令 | `!` 开头，由扩展 DLL 提供 | `!analyze`、`!heap`、`!address`、`!process`、`!handle` |

```text
.chain          # 看已加载哪些扩展 DLL
.load ext       # 加载扩展
.unload ext     # 卸载
.loadby sos clr # 按模块名加载（.NET）
.help           # 点命令帮助
!help           # 扩展命令帮助
!help analyze   # 某个扩展命令帮助
```

### 3.2 表达式

- 默认 **MASM** 表达式：`? @rip`、`? poi(@rsp)`。
- 切换 C++：`.expr /s c++`，之后用 `??`。
- `poi(addr)`：按指针大小解引用。
- `by(addr)` / `wo(addr)` / `dwo(addr)` / `qwo(addr)`：按 1/2/4/8 字节解引用。
- `@` 前缀：强制按寄存器/伪寄存器解释，如 `@rax`、`@rip`。
- `.formats <num>`：用多种进制显示同一个数。

```text
? @rip
? poi(@rsp)
? by(@rsp)
.formats 0n1000
```

### 3.3 伪寄存器

| 伪寄存器 | 含义 |
|---|---|
| `$sp` | 当前栈指针 |
| `$ip` | 当前指令指针 |
| `$ra` | 当前返回地址 |
| `$proc` | 当前进程 |
| `$thread` | 当前线程 |
| `$frame` | 当前栈帧号 |
| `$t0`–`$t19` | 临时寄存器（脚本用） |
| `@$peb` | 当前进程 PEB（用户态） |
| `@$teb` | 当前线程 TEB（用户态） |

### 3.4 别名与脚本基础

```text
as /x myvar @rsp        # 定义别名 myvar = rsp
? ${myvar}              # 使用别名
ad myvar                # 删除
al                      # 列出所有别名
```

```text
.foreach (addr {!dumpheap -short -type System.String}) {
    !do ${addr}
}
```

```text
.if (@eax == 0) { .echo zero } .else { .echo nonzero }
.printf "rip=%p rsp=%p\n", @rip, @rsp
```

- `$$` 是注释；`;` 分隔多条命令。
- `$t0`–`$t19` 可保存中间结果：`r $t0 = @rsp`。

> 一句话：**点命令管“调试器自己”，感叹号命令管“被调试对象”；`!analyze` 只是 ext.dll 里的一个扩展。**

---

## 4. 打开 dump 后的第一组命令

### 4.1 事件与异常

| 命令 | 作用 |
|---|---|
| `.lastevent` | 显示最后一个调试事件 |
| `.exr` | 显示当前异常记录 |
| `.exr -1` | 显示最后一个异常记录 |
| `.cxr` | 显示当前上下文记录 |
| `.ecxr` | **把上下文切换到异常记录对应的线程/寄存器** |
| `!analyze -v` | 自动分析异常/崩溃 |

### 4.2 为什么必须先 `.ecxr`

dump 的默认上下文不一定是崩溃瞬间的上下文：

- WER 生成的 dump 可能停在 `WerFault` 或 `RaiseException`。
- 多线程 dump 默认可能停在任意线程。
- 内核 dump 默认上下文可能是当前 CPU 的 idle 线程。

`.ecxr` 会读取异常记录里的 `ContextRecord`，把寄存器、栈、线程都切到“异常发生的那一刻”。

### 4.3 第一屏建议

```text
!analyze -v
.ecxr
r
kv
lm
```

如果 `.ecxr` 报 `No exception record`，说明这个 dump 不是异常 dump（例如手动 full dump），此时直接看当前线程和 `!analyze -v` 的结果。

> 一句话：**没有 `.ecxr` 的栈，可能是别人的栈。**

---

## 5. 读 `!analyze -v`

### 5.1 关键字段

| 字段 | 含义 | 怎么看 |
|---|---|---|
| `EXCEPTION_CODE` | 异常码 | 对照 §14 的表 |
| `EXCEPTION_PARAMETER1` | 访问类型 | `0` 读、`1` 写、`8` 执行 |
| `FAULTING_IP` | 出错指令地址 | `u 地址` 看指令 |
| `FAULTING_THREAD` | 出错线程 | `~` 找到并切换 |
| `READ_ADDRESS` / `WRITE_ADDRESS` | 访问的非法地址 | `!address` / `!vprot` |
| `PROCESS_NAME` | 进程名 | 确认是不是目标进程 |
| `MODULE_NAME` | 符号所属模块 | 结合 `lm` 看版本 |
| `IMAGE_NAME` | 镜像文件名 | 实际 DLL/EXE |
| `SYMBOL_NAME` | 最接近的符号 | 不一定是真凶 |
| `STACK_TEXT` | 故障线程栈 | 重点看前 5–10 帧 |
| `FAILURE_BUCKET_ID` | 失败分类桶 | 搜索/统计用 |
| `BUGCHECK_CODE` | 蓝屏码（内核） | 对照 §12.6 |
| `BUGCHECK_P1`–`P4` | 蓝屏参数 | 不同码含义不同 |
| `DRIVER_FAULT` | 是否驱动过错（内核） | `1` 表示驱动 |
| `Probably caused by` | 自动推测的元凶 | ⚠️ 只作线索 |

### 5.2 用户态示例（字段示意）

```text
EXCEPTION_CODE: (NTSTATUS) 0xc0000005 - The instruction at 0x...
FAULTING_IP:
app!foo+0x42
...
EXCEPTION_PARAMETER1:  0000000000000000
READ_ADDRESS:           0000000000000010
...
PROCESS_NAME:  app.exe
MODULE_NAME:   app
IMAGE_NAME:    app.exe
STACK_TEXT:
app!foo+0x42
app!bar+0x18
app!main+0x9c
...
```

读法：

1. `0xc0000005` + `READ_ADDRESS 0x10` → 空指针/近空指针读取。
2. `FAULTING_IP` 在 `app!foo+0x42` → 反汇编 `u app!foo+0x42` 看是哪条指令。
3. `STACK_TEXT` 从下往上看调用链，确认 `foo` 的调用者是谁。
4. `lm` 确认 `app.exe` 的版本和 PDB 是否匹配。

### 5.3 `!analyze` 的可信度

- 对**空指针、栈溢出、堆损坏、驱动蓝屏**通常比较准。
- 对**多线程竞争、use-after-free、逻辑错误**经常只能给“受害者”。
- `Probably caused by` 可能是最后碰坏数据的人，而不是最早写坏的人。
- 永远用 `kv` + `lm` + 源码/反汇编交叉验证。

### 5.4 `!analyze` 的常用选项

| 命令 | 作用 |
|---|---|
| `!analyze -v` | 详细分析 |
| `!analyze -hang` | 挂起/死锁分析 |
| `!analyze -show 0x9F` | 显示某个 bugcheck 码的说明 |
| `!analyze -f` | 强制重新分析（部分版本） |

> 一句话：**`!analyze -v` 给你“嫌疑犯名单”，定罪要靠栈、模块和代码。**

---

## 6. 线程与上下文

### 6.1 线程列表与切换

| 命令 | 作用 |
|---|---|
| `~` | 列出当前进程所有线程 |
| `~*` | 对所有线程执行命令的前缀 |
| `~0s` | 切换到 0 号线程 |
| `~1s` | 切换到 1 号线程 |
| `~2s` | 切换到 2 号线程 |
| `.thread` | 显示当前线程 |
| `~*k` | 所有线程的栈 |
| `~*kb` | 所有线程的栈（带参数） |
| `~*e !clrstack` | 对所有线程执行 `!clrstack`（.NET） |

### 6.2 线程号与系统线程 ID

- `~` 输出里的 `0`、`1`、`2` 是调试器线程索引，不是 Windows TID。
- `~` 输出通常包含 `Id: 1234.5678`，其中 `5678` 是系统 TID。
- 内核 dump 用 `!process` / `!thread` 看系统线程对象。

### 6.3 线程时间

```text
!runaway
```

- 显示每个线程的 **用户态 / 内核态 CPU 时间**。
- 高 CPU 问题先看谁排第一，再 `~Ns` 切过去看栈。
- 挂起问题也看谁一直占着 CPU 或一直阻塞。

### 6.4 线程池

```text
!threadpool
```

- 用户态线程池状态：工作线程数、排队请求、定时器。
- 线程池饥饿时，回调排队但无空闲线程。

### 6.5 托管线程

```text
!threads
```

- 仅 .NET（SOS）可用。
- 显示托管线程 ID、锁计数、异常、GC 模式、线程状态。
- 与 `~` 的 native 线程号交叉对照。

> 一句话：**用户态看 `~`，内核看 `!process` / `!thread`，.NET 看 `!threads`。**

---

## 7. 栈：k / kb / kv / kn

### 7.1 k 家族

| 命令 | 内容 |
|---|---|
| `k` | 基本栈回溯 |
| `kb` | 栈 + 前三个参数 |
| `kp` | 栈 + 完整参数（按调用约定） |
| `kv` | 栈 + 帧指针/展开信息（FPO） |
| `kn` | 栈 + 帧号 |
| `kd` | 栈 + 原始字节（部分版本） |
| `~*k` | 所有线程 |
| `~*kb` | 所有线程 + 参数 |

### 7.2 输出列（x64 `kv`）

```text
Child-SP          RetAddr           : Args to Child : Call Site
fffff880`0a3b7c68 fffff800`02a1b2c3 : ... : nt!KeBugCheckEx
```

| 列 | 含义 |
|---|---|
| `Child-SP` | 当前帧的栈指针（x86 是 `ChildEBP`） |
| `RetAddr` | 返回地址（下一帧的指令地址） |
| `Args to Child` | 传给被调用者的参数（x64 前四个寄存器 + 栈） |
| `Call Site` | 符号化后的调用位置 |

**读法**：从下往上读调用链；最上面是“现在停在哪”，下面是“谁调用了它”。

### 7.3 手动走栈

当 `k` 显示不全或栈被破坏时：

```text
dps @rsp L40          # x64：按指针大小显示栈，带符号
dds @esp L40          # x86：按双字显示栈
```

- 在输出里找“看起来像代码地址”的值。
- 对每个候选地址执行 `ln 地址`，看属于哪个函数。
- 结合 `u 地址` 确认是不是调用指令的下一条。

### 7.4 栈坏了怎么办

常见提示：

```text
WARNING: Stack unwind information not available.
WARNING: Frame IP not in any known module.
```

处理顺序：

1. `kv` 换一种展开方式。
2. `dps @rsp` 手动找返回地址。
3. `uf 函数` 看函数序言/尾声，确认栈帧大小。
4. `!chkimg -d 模块` 看代码是否被改。
5. 怀疑栈溢出：`k` 是否深不见底，`!teb` 看 `StackBase` / `StackLimit`。

### 7.5 切换帧与看局部变量

```text
.frame 2        # 切到第 2 帧
dv              # 显示局部变量（需要符号）
dv /t           # 带类型
dv /v           # 详细
dt _CONTEXT     # 看结构体
```

⚠️ 优化过的 release 版本经常没有可靠的局部变量；`dv` 可能显示 `Unable to enumerate locals`。

> 一句话：**`k` 看轮廓，`kv` 看细节，`dps` 救急，`.frame` 进帧里看变量。**

---

## 8. 模块与符号核对

### 8.1 `lm`

| 命令 | 作用 |
|---|---|
| `lm` | 列出模块（起始/结束地址、模块名、镜像名） |
| `lmv` | 详细模式（时间戳、大小、符号类型、路径） |
| `lmf` | 显示完整路径 |
| `lm k` | 内核模块 |
| `lm u` | 用户模块 |
| `lm t` | 带时间戳 |

`lm` 输出示例：

```text
start             end                 module name
00007ff6`12340000 00007ff6`123a0000   app        (deferred)
00007ffb`0f000000 00007ffb`0f1f0000   ntdll      (pdb symbols)
```

### 8.2 `!lmi` 与 `!dh`

```text
!lmi app
!dh app
```

- `!lmi`：模块的详细加载信息（时间戳、镜像大小、符号类型、PDB 路径）。
- `!dh`：PE 头信息（节表、入口点、镜像基址、导入表等）。

### 8.3 `!dlls`

```text
!dlls
```

- 用户态已加载模块列表，含基址、大小、路径、版本。
- 排查 DLL 劫持、版本冲突、重复加载时很有用。

### 8.4 符号查找

| 命令 | 作用 |
|---|---|
| `x app!*` | 列出 `app` 模块所有符号 |
| `x app!foo*` | 按模式查找符号 |
| `ln 0x00007ff6`12345678` | 找地址最近的符号 |
| `u app!foo` | 反汇编函数 |
| `uf app!foo` | 反汇编整个函数 |

### 8.5 校验镜像

```text
!chkimg -d app
```

- 把内存中的代码与磁盘上的镜像对比，列出被修改的字节。
- 用于检测热补丁、inline hook、代码损坏。
- 需要磁盘上有对应二进制；找不到会报错。

### 8.6 模块版本冲突

典型现象：

- 同一 DLL 在 `lm` 中出现两次（不同路径/版本）。
- `!dlls` 显示的版本与预期不符。
- 崩溃栈落在旧版本函数里。

处理：

```text
lmf
!dlls
!lmi 模块名
```

确认加载路径、时间戳、版本号，再决定是清理 PATH、修 manifest，还是修安装目录。

> 一句话：**栈告诉你“在哪”，`lm` 告诉你“是谁”，`!lmi` 告诉你“哪个版本”。**

---

## 9. 内存、地址与搜索

### 9.1 `!address`

| 命令 | 作用 |
|---|---|
| `!address -summary` | 按用途汇总虚拟地址空间 |
| `!address` | 列出所有区域 |
| `!address 0x12345678` | 查看某个地址所在区域 |
| `!address @rsp` | 查看栈指针所在区域 |

`-summary` 重点看：

- `MEM_COMMIT` / `MEM_RESERVE` / `MEM_FREE`
- `Image`（模块）
- `Mapped`（文件映射）
- `Stack`（栈）
- `Heap`（堆）
- `Private`（私有提交）

### 9.2 `!vprot`

```text
!vprot 0x12345678
```

- 查看某个地址的页保护属性（`PAGE_READWRITE`、`PAGE_NOACCESS`、`PAGE_GUARD` 等）。
- 访问违例时，用它确认目标页到底可不可读/可写。

### 9.3 搜索内存

| 命令 | 搜索内容 |
|---|---|
| `s -a <range> "text"` | ASCII 字符串 |
| `s -u <range> "text"` | Unicode 字符串 |
| `s -b <range> 41 42 43` | 字节序列 |
| `s -w <range> 0x1234` | 16 位字 |
| `s -d <range> 0x12345678` | 32 位双字 |

范围写法：

```text
s -a 0 L?80000000 "password"     # 从 0 开始搜 2GB（很慢，慎用）
s -a @rsp L1000 "hello"          # 只在栈附近搜
s -a app!foo L200 "abc"          # 在函数附近搜
```

### 9.4 显示内存

| 命令 | 格式 |
|---|---|
| `db` | 字节 + ASCII |
| `dw` | 16 位字 |
| `dd` | 32 位双字 |
| `dq` | 64 位四字 |
| `dp` | 指针大小（带符号） |
| `dpp` | 指针 + 符号 |
| `da` | ASCII 字符串 |
| `du` | Unicode 字符串 |
| `dc` | 双字 + ASCII |
| `dds` | 栈（双字 + 符号） |
| `dps` | 栈（指针 + 符号） |

```text
db @rsp L40
dq 0x00000000`12345678 L10
da 0x00007ff6`12340000
dps @rsp L40
```

### 9.5 堆与池

| 命令 | 适用 | 作用 |
|---|---|---|
| `!heap -s` | 用户态 | 堆摘要 |
| `!heap -a <heap>` | 用户态 | 指定堆详情 |
| `!heap -stat -h <heap>` | 用户态 | 按大小统计 |
| `!heap -flt s <size>` | 用户态 | 按块大小过滤 |
| `!heap -p -a <addr>` | 用户态 | 页堆（Page Heap）查地址 |
| `!pool <addr>` | 内核 | 查地址所在池块与 tag |
| `!poolused 2` | 内核 | 按 tag 统计池使用 |
| `!pte <addr>` | 内核 | 页表项 |

⚠️ `!heap -p -a` 需要事先开启 Page Heap（`gflags /p /enable app.exe /full`），否则信息有限。

> 一句话：**用户态看堆 `!heap`，内核看池 `!pool`，地址属性看 `!address` 和 `!vprot`。**

---

## 10. 寄存器、反汇编、类型

### 10.1 寄存器

```text
r                   # 显示所有寄存器
r rip               # 显示单个
r @rax=0            # 修改（dump 中改寄存器只影响调试器视图）
r @rip=app!main     # 改指令指针（dump 中一般不用）
```

- x64：`rax`、`rbx`、`rcx`、`rdx`、`rsi`、`rdi`、`rbp`、`rsp`、`r8`–`r15`、`rip`、`eflags`。
- x86：`eax`、`ebx`、`ecx`、`edx`、`esi`、`edi`、`ebp`、`esp`、`eip`、`eflags`。

### 10.2 反汇编

| 命令 | 作用 |
|---|---|
| `u <addr>` | 从地址开始反汇编几条 |
| `u <addr> L20` | 反汇编 20 条 |
| `u @rip L10` | 从当前指令开始 |
| `uf <func>` | 反汇编整个函数 |
| `ub <addr>` | 向前反汇编 |
| `ur <addr>` | 反汇编并显示寄存器使用（部分版本） |

```text
u app!foo+0x42 L10
uf app!foo
```

### 10.3 类型

| 命令 | 作用 |
|---|---|
| `dt <type> <addr>` | 按类型解释内存 |
| `dt -r <type> <addr>` | 递归展开 |
| `dt -b <type> <addr>` | 显示位域 |
| `dt ntdll!_PEB @$peb` | 看 PEB |
| `dt ntdll!_TEB @$teb` | 看 TEB |
| `dt _EPROCESS <addr>` | 看内核进程对象 |

### 10.4 `dx`（调试器对象模型）

```text
dx @$curprocess
dx @$curthread
dx @$cursession
dx @$peb
dx @$teb
dx @$curprocess.Modules
dx -g @$curprocess.Threads
```

- `dx` 比 `dt` 更“结构化”，适合浏览对象树。
- 需要较新的调试引擎（WinDbg 10 / 新版 SDK）。

### 10.5 C++ 表达式

```text
.expr /s c++
?? @$peb->ImageBaseAddress
?? @$peb->ProcessParameters->CommandLine.Buffer
```

> 一句话：**`u` 看“这条指令在干嘛”，`dt` 看“这块内存是什么结构”，`dx` 看“这个对象有什么”。**

---

## 11. 用户态专项

### 11.1 PEB / TEB

| 命令 | 作用 |
|---|---|
| `!peb` | 进程环境块：ImageBase、命令行、环境变量、加载器链表 |
| `!teb` | 线程环境块：栈范围、LastError、TLS |
| `dt ntdll!_PEB @$peb` | 按结构体看 PEB |
| `dt ntdll!_TEB @$teb` | 按结构体看 TEB |

`!teb` 重点字段：

- `StackBase`：栈底（高地址）。
- `StackLimit`：栈顶（低地址）。
- `DeallocationStack`：栈的保留区底部。
- `LastErrorValue`：线程最后错误码。

### 11.2 堆

```text
!heap -s
!heap -stat -h 0000000000120000
!heap -flt s 100
!heap -p -a 0000000000abcdef
```

- `!heap -s` 先看有几个堆、每个堆的提交/保留大小。
- 怀疑某地址是堆块：`!heap -p -a`（需 Page Heap）或 `!heap -a`。
- 堆损坏常见异常码 `0xC0000374`。

### 11.3 句柄

```text
!handle 0 f          # 列出所有句柄
!handle 0x1a4 f      # 看某个句柄详情
!htrace 0x1a4        # 句柄操作跟踪（需先开启）
```

- 句柄泄漏：`!handle 0 f` 看总数和类型分布。
- 常见类型：`File`、`Event`、`Mutant`、`Section`、`Thread`、`Process`、`Key`。
- `!htrace` 需要 live 时 `!htrace -enable`，dump 中不一定有数据。

### 11.4 锁

```text
!cs -l               # 列出所有临界区
!cs -s 0x12345678    # 看指定临界区
!critsec 0x12345678  # 临界区详情
!locks               # 内核资源锁（用户态 dump 不适用）
```

`!cs -l` 重点看：

- `OwningThread`：谁持有锁。
- `LockCount`：递归/等待计数。
- `ContentionCount`：争用次数。

### 11.5 地址空间

```text
!address -summary
!address 0x12345678
!vprot 0x12345678
```

- 判断某个地址是栈、堆、镜像还是保留区。
- 判断访问违例是“空指针附近”还是“已释放内存”。

### 11.6 其他

| 命令 | 作用 |
|---|---|
| `!gle` | 当前线程最后错误码 |
| `!error 0xC0000005` | 解码 NTSTATUS |
| `!runaway` | 线程 CPU 时间 |
| `!threadpool` | 线程池状态 |
| `!chkimg -d 模块` | 代码校验 |
| `!dlls` | 模块列表 |
| `!analyze -hang` | 挂起分析 |

> 一句话：**用户态崩溃三件套：`!peb` 看环境，`!heap` 看堆，`!cs` 看锁。**

---

## 12. 内核 dump 专项

### 12.1 首先看 bugcheck

```text
!analyze -v
.bugcheck
.trap
```

`.bugcheck` 直接显示 bugcheck 码与四个参数；`!analyze -v` 会解释并给出栈；`.trap` 把上下文切到陷阱帧（内核异常现场）。

### 12.2 进程与线程

| 命令 | 作用 |
|---|---|
| `!process 0 0` | 列出所有进程 |
| `!process <addr> 7` | 进程详情 + 线程 + 栈 |
| `.process <addr>` | 切换进程上下文 |
| `!thread <addr>` | 线程详情 |
| `.thread <addr>` | 切换线程上下文 |
| `!stacks 2` | 所有内核线程栈摘要 |

### 12.3 驱动、设备、IRP

| 命令 | 作用 |
|---|---|
| `!drvobj <driver> 2` | 驱动对象 + 设备对象 |
| `!devobj <device>` | 设备对象详情 |
| `!devstack <device>` | 设备栈 |
| `!irp <addr>` | IRP 详情 |
| `!irpfind` | 搜索所有 IRP |
| `!poaction` | 电源动作信息（0x9F 常用） |

**0x9F 排查顺序**：`!analyze -v` → `!poaction` → `!irpfind` → 找阻塞的 power IRP → `!devstack` / `!drvobj` 定位驱动。

### 12.4 内存与池

```text
!vm
!memusage
!filecache
!pool <addr>
!poolused 2
```

- `!vm`：虚拟内存统计。
- `!memusage`：物理内存使用。
- `!filecache`：文件缓存。
- `!pool <addr>`：地址属于哪个池块、什么 tag。
- `!poolused 2`：按 tag 排序的池占用。

### 12.5 系统信息

```text
!sysinfo cpuinfo
!sysinfo machineid
!sysinfo smbios
```

- CPU 型号/核数、机器 ID、SMBIOS 信息。
- 0x124（WHEA）时配合 `!whea` 看硬件错误。

### 12.6 常见 bugcheck

| 码 | 名称 | 先看什么 |
|---|---|---|
| `0x0A` | `IRQL_NOT_LESS_OR_EQUAL` | 栈、IRQL、驱动 |
| `0x1E` | `KMODE_EXCEPTION_NOT_HANDLED` | 异常码、栈 |
| `0x3B` | `SYSTEM_SERVICE_EXCEPTION` | 系统调用参数、栈 |
| `0x50` | `PAGE_FAULT_IN_NONPAGED_AREA` | `!pte`、`!pool`、地址 |
| `0x7E` | `SYSTEM_THREAD_EXCEPTION_NOT_HANDLED` | 异常码、驱动 |
| `0x9F` | `DRIVER_POWER_STATE_FAILURE` | `!poaction`、`!irp` |
| `0xD1` | `DRIVER_IRQL_NOT_LESS_OR_EQUAL` | 驱动栈、IRQL |
| `0xEF` | `CRITICAL_PROCESS_DIED` | 哪个进程、为什么死 |
| `0x133` | `DPC_WATCHDOG_VIOLATION` | 长 DPC、驱动 |
| `0x139` | `KERNEL_SECURITY_CHECK_FAILURE` | 栈、内存损坏 |
| `0x124` | `WHEA_UNCORRECTABLE_ERROR` | `!whea`、`!errrec` |
| `0x101` | `CLOCK_WATCHDOG_TIMEOUT` | CPU/虚拟化/驱动 |
| `0x109` | `CRITICAL_STRUCTURE_CORRUPTION` | 内核代码/数据被改 |
| `0xC2` | `BAD_POOL_CALLER` | `!pool`、调用栈 |
| `0xC4` | `DRIVER_VERIFIER_DETECTED_VIOLATION` | `!verifier 3` |
| `0xC5` | `DRIVER_CORRUPTED_EXPOOL` | 池损坏、驱动 |
| `0x1A` | `MEMORY_MANAGEMENT` | 内存/页表 |
| `0x4E` | `PFN_LIST_CORRUPT` | 物理页链表 |
| `0x7A` | `KERNEL_DATA_INPAGE_ERROR` | 磁盘/存储 |
| `0xF4` | `CRITICAL_OBJECT_TERMINATION` | 关键进程/线程 |

### 12.7 其他内核命令

| 命令 | 作用 |
|---|---|
| `!pcr` | 当前处理器控制区 |
| `!whea` | WHEA 错误 |
| `!errrec <addr>` | WHEA 错误记录 |
| `!verifier 3 <driver>` | 驱动验证器信息 |
| `!chkimg -d <module>` | 内核代码校验 |
| `!blackboxbsod` | 读取上一次蓝屏的黑匣子信息（Win8+） |
| `!timer` | 定时器信息 |
| `!ndiskd` / `!wdfkd` / `!usbkd` / `!storport` | 子系统专用扩展 |

> 一句话：**内核先看 bugcheck 码，再看“谁在栈上”，最后用 `!drvobj` / `!irp` / `!pool` 定位驱动和对象。**

---

## 13. .NET / 托管代码

### 13.1 加载 SOS

```text
.loadby sos clr        # .NET Framework
.loadby sos coreclr    # .NET Core / .NET 5+
```

如果 `loadby` 找不到，显式指定路径：

```text
.load C:\Windows\Microsoft.NET\Framework64\v4.0.30319\sos.dll
```

### 13.2 常用命令

| 命令 | 作用 |
|---|---|
| `!threads` | 托管线程列表 |
| `!clrstack` | 托管调用栈 |
| `!clrstack -a` | 带参数 |
| `!clrstack -l` | 带局部变量 |
| `!pe` | 当前异常对象 |
| `!dumpheap -stat` | 堆统计 |
| `!dumpheap -type <类型>` | 按类型过滤 |
| `!gcroot <addr>` | 找 GC 根 |
| `!do <addr>` | 打印对象 |
| `!dumpobj <addr>` | 同上（别名） |
| `!syncblk` | 监视器/锁竞争 |
| `!eeheap -gc` | GC 堆大小 |
| `!name2ee <module>!<类型>` | 找类型/方法 |
| `!bpmd` | 托管断点（live） |

### 13.3 典型流程

```text
.loadby sos clr
!threads
!pe
!clrstack -a
!dumpheap -stat
!gcroot 00000000`12345678
```

- 先 `!threads` 找带异常/锁的线程。
- `!pe` 看异常类型、消息、InnerException。
- `!clrstack` 看托管调用链。
- 内存问题用 `!dumpheap -stat` + `!gcroot`。

### 13.4 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `Failed to load data access DLL` | SOS/DAC 与运行时版本不匹配 | 用目标机器的 SOS |
| `!dumpheap` 失败 | minidump 没有堆 | 抓 full dump |
| `!clrstack` 只有 native 帧 | SOS 未加载/线程不对 | `.loadby sos`，切换线程 |
| `!pe` 无输出 | 当前线程没有托管异常 | 用 `!threads` 找异常线程 |

> 一句话：**托管 dump 先 `.loadby sos`，再 `!threads` + `!pe` + `!clrstack`；`dotnet-dump` 是 .NET Core 的备选。**

---

## 14. 崩溃类型与定位套路

### 14.1 常见异常码

| 异常码 | 名称 | 含义 |
|---|---|---|
| `0x80000003` | `STATUS_BREAKPOINT` | 断点/调试器 |
| `0xC0000005` | `STATUS_ACCESS_VIOLATION` | 访问违例 |
| `0xC0000006` | `STATUS_IN_PAGE_ERROR` | 页入错误 |
| `0xC000000D` | `STATUS_INVALID_PARAMETER` | 参数无效 |
| `0xC0000017` | `STATUS_NO_MEMORY` | 内存不足 |
| `0xC000001D` | `STATUS_ILLEGAL_INSTRUCTION` | 非法指令 |
| `0xC0000094` | `STATUS_INTEGER_DIVIDE_BY_ZERO` | 整数除零 |
| `0xC000009A` | `STATUS_INSUFFICIENT_RESOURCES` | 资源不足 |
| `0xC00000FD` | `STATUS_STACK_OVERFLOW` | 栈溢出 |
| `0xC0000135` | `STATUS_DLL_NOT_FOUND` | DLL 找不到 |
| `0xC0000142` | `STATUS_DLL_INIT_FAILED` | DLL 初始化失败 |
| `0xC0000374` | `STATUS_HEAP_CORRUPTION` | 堆损坏 |
| `0xC0000409` | `STATUS_STACK_BUFFER_OVERRUN` | 栈缓冲溢出/快速失败 |
| `0xC0000420` | `STATUS_ASSERTION_FAILURE` | 断言失败 |
| `0xC0000602` | `STATUS_FAIL_FAST_EXCEPTION` | 快速失败 |
| `0xE06D7363` | MSVC C++ 异常 | `throw` |
| `0xE0434352` | CLR 异常 | .NET `Exception` |

### 14.2 访问违例（0xC0000005）

`!analyze -v` 关键参数：

- `EXCEPTION_PARAMETER1`：`0` 读、`1` 写、`8` 执行。
- `READ_ADDRESS` / `WRITE_ADDRESS`：目标地址。
- `FAULTING_IP`：出错指令。

排查：

```text
.ecxr
r
kv
u @rip L10
!address 0x<目标地址>
!vprot 0x<目标地址>
```

常见模式：

| 地址 | 可能原因 |
|---|---|
| `0x0`–`0x1000` | 空指针 / 结构体偏移 |
| 堆地址 | use-after-free / 越界 |
| 栈地址 | 栈溢出 / 悬垂栈指针 |
| 已释放模块地址 | 回调到已卸载 DLL |
| 高位内核地址（用户态） | 错误指针 / 驱动传入 |

### 14.3 栈溢出（0xC00000FD）

```text
k
!teb
```

- `k` 会显示非常深的递归调用。
- `!teb` 看 `StackBase` 与 `StackLimit`，确认当前 `rsp` 是否接近 `StackLimit`。
- 常见原因：无限递归、超大局部数组、`alloca` 循环。

### 14.4 堆损坏（0xC0000374）

```text
!analyze -v
!heap -s
!heap -p -a <addr>
```

- 堆损坏通常不是“崩在坏的地方”，而是“坏的地方后来被用了”。
- 开启 Page Heap 复现，能更早抓到越界写。
- `!heap -p -a` 需要 Page Heap。

### 14.5 DLL 加载失败（0xC0000135 / 0xC0000142）

```text
!dlls
lm
!lmi <dll>
```

- `0xC0000135`：找不到依赖 DLL。
- `0xC0000142`：DLL 的 `DllMain` 初始化失败。
- 用 `!dlls` 看已加载列表，用 `lm` 看缺失模块。
- live 调试可开 Loader Snaps（`gflags`）看加载过程。

### 14.6 C++ / CLR 异常

- `0xE06D7363`：MSVC C++ 异常，`!analyze -v` 会显示 `CPP_EH` 相关栈。
- `0xE0434352`：.NET 异常，先 `.loadby sos clr`，再 `!pe`。
- 异常码只是“入口”，真正原因看 `STACK_TEXT` 和异常对象。

### 14.7 快速失败（0xC0000409）

- 常见于 `/GS` 栈保护、`__fastfail`、CRT 检测到严重错误。
- `!analyze -v` 会给出 `FAIL_FAST` 相关字段。
- 看栈上是否有 `__report_gsfailure`、`__fastfail`。

> 一句话：**异常码定大类，栈定位置，内存/堆/锁定原因。**

---

## 15. 死锁、挂起、高 CPU

### 15.1 挂起 / 无响应

```text
!analyze -hang
~*k
!cs -l
!locks
!threads
!syncblk
```

顺序：

1. `!analyze -hang` 给出等待链/锁的线索。
2. `~*k` 看所有线程卡在哪。
3. `!cs -l` 找临界区持有者。
4. .NET 用 `!syncblk` 看 Monitor 竞争。

### 15.2 用户态死锁特征

- 线程 A 持有锁 1，等待锁 2。
- 线程 B 持有锁 2，等待锁 1。
- `!cs -l` 中 `OwningThread` 与等待栈能对应上。

```text
!cs -l
~0s
kv
~1s
kv
```

### 15.3 内核死锁

```text
!locks
!process 0 0
!stacks 2
!irpfind
```

- `!locks` 看资源锁。
- `!stacks 2` 看所有线程是否卡在 `KeWaitForSingleObject`。
- `!irpfind` 找 pending IRP。

### 15.4 高 CPU

```text
!runaway
~*k
!threadpool
```

- `!runaway` 找 CPU 时间最高的线程。
- `~Ns` 切过去 `kv` 看它在干什么。
- `!threadpool` 看线程池是否饥饿/排队。

> 一句话：**挂起看“谁等谁”，高 CPU 看“谁在跑”，两者都要 `~*k`。**

---

## 16. 生成 dump

### 16.1 类型

| 类型 | 内容 | 适用 |
|---|---|---|
| 用户 minidump | 线程、模块、栈、少量内存 | 快速崩溃定位 |
| 用户 full dump | 全部用户态内存 | 堆、句柄、内存分析 |
| 内核 small dump | 内核栈、模块、少量内存 | 蓝屏快速 |
| 内核 kernel dump | 内核内存 | 驱动/内核深度分析 |
| 内核 complete dump | 全部物理内存 | 最完整，文件最大 |
| 自动 dump | 系统默认策略 | Windows 10/11 默认 |

⚠️ minidump 通常没有堆，`!heap`、`!gcroot` 可能不可用；要分析内存必须 full dump。

### 16.2 用 cdb 生成

```bat
:: 附加到进程，抓 full dump，然后退出
cdb -p 1234 -c ".dump /ma C:\dumps\app.dmp; q"

:: 按进程名
cdb -pn app.exe -c ".dump /ma C:\dumps\app.dmp; q"
```

| 命令 | 作用 |
|---|---|
| `.dump /ma <file>` | 用户态 full dump（含全部内存） |
| `.dump /mm <file>` | 用户态 minidump |
| `.dump /mf <file>` | 用户态 full memory |
| `.dump /f <file>` | 内核 full dump |
| `.dump /k <file>` | 内核 kernel dump |

### 16.3 其他方式

**Procdump**

```bat
procdump -ma -e -w app.exe C:\dumps
procdump -ma -e 1 -w app.exe C:\dumps
```

- `-ma`：full dump。
- `-e`：未处理异常时抓。
- `-e 1`：第一次机会异常就抓。
- `-w`：等待进程启动。

**任务管理器**

- 详细信息 → 右键进程 → “创建转储文件”。

**WER LocalDumps**

```text
HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps
    DumpFolder = C:\dumps      (REG_EXPAND_SZ)
    DumpType   = 2             (1=mini, 2=full)
    DumpCount  = 10
```

**Page Heap（抓堆越界）**

```bat
gflags /p /enable app.exe /full
gflags /p /disable app.exe
```

### 16.4 dump 也可能不完整

- 抓取时进程已退出/内存不可读。
- 磁盘空间不足。
- 权限不足。
- 内核 dump 的页面文件配置不对。

> 一句话：**崩溃定位用 minidump，内存/堆/句柄问题必须 full dump。**

---

## 17. 脚本与批处理

### 17.1 命令行串联

```bat
cdb -z app.dmp -c ".symfix; .reload; !analyze -v; .ecxr; kv; q"
```

- `-c` 里的命令用 `;` 分隔。
- 命令按顺序执行，最后 `q` 退出。
- 适合做“一键分析”快捷方式。

### 17.2 日志

```text
.logopen /t C:\logs\cdb.log
... 一堆命令 ...
.logclose
```

- `/t` 追加时间戳。
- `-logo cdb.log` 也能从头记录。

### 17.3 别名

```text
as /x kk @rsp
? ${kk}
ad kk
```

### 17.4 条件与循环

```text
.foreach (addr {!dumpheap -short -type System.String}) {
    !do ${addr}
}
```

```text
.if (@rax == 0) {
    .echo "rax is null"
} .else {
    .echo "rax != 0"
}
```

```text
.printf "rip=%p rsp=%p\n", @rip, @rsp
```

### 17.5 批量执行

```text
!for_each_thread "kb"
!for_each_process "!process @#Process 0"
```

- `!for_each_thread` 对每个线程执行命令。
- `!for_each_process` 对每个进程执行命令。
- 不同版本扩展的伪寄存器名可能略有差异，先用 `!help for_each_thread` 确认。

### 17.6 JavaScript 脚本

```text
.scriptload C:\scripts\analyze.js
```

- 新版调试器支持 JS 脚本与 `dx` 查询。
- 适合做自动化报告、对象遍历。

> 一句话：**`-c` 做一键流程，`.logopen` 留证据，`.foreach` 批量处理。**

---

## 18. 常见错误与坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `Symbol file could not be found` | 符号路径不对/网络不通 | `.symfix`、`!sym noisy`、检查代理 |
| `Mismatched PDB` | PDB 与二进制不匹配 | 找同版本 PDB |
| `Unable to load image` | 缺二进制 | `-i`、`.exepath`、把 bin 放本地 |
| `Unknown_Image` | 无符号 | 补符号；只能看反汇编 |
| `Stack unwind information not available` | FPO/优化/栈坏 | `kv`、`dps` 手动走栈 |
| `No exception record` | 不是异常 dump | 直接看当前线程 |
| `Unable to enumerate locals` | 优化/无符号 | 看寄存器和反汇编 |
| `Failed to load data access DLL` | SOS/DAC 版本不匹配 | 用目标运行时对应 SOS |
| `!heap` 失败 | minidump 无堆 | 抓 full dump |
| `!gcroot` 失败 | 无堆/无符号 | full dump + 正确 SOS |
| `This dump file has an exception of interest` | 有异常记录 | `.ecxr` |
| `WARNING: Frame IP not in any known module` | 栈上有坏地址 | 手动走栈、`!chkimg` |
| `ERROR: Module load completed but symbols could not be loaded` | PDB 缺失/不匹配 | `!lmi` 看签名 |
| 32 位 dump 用 x64 cdb | 位数不匹配 | 换 x86 cdb |
| `!analyze` 说是 A，实际是 B | 自动分析误判 | 看 `kv` 和源码 |

⚠️ 另外三个常见坑：

1. **dump 与二进制/PDB 不是同一次构建**——栈和结构体全错。
2. **只看 `!analyze` 的 “Probably caused by”**——经常是受害者。
3. **在 minidump 上分析堆/句柄**——数据根本不在。

> 一句话：**符号、位数、dump 类型，是 cdb 分析的“三座大山”。**

---

## 19. 命令速查表

### 19.1 启动与符号

| 命令 | 作用 |
|---|---|
| `cdb -z file.dmp` | 打开 dump |
| `cdb -z file.dmp -c "cmd; q"` | 打开并执行命令 |
| `-y srv*C:\Symbols*https://msdl.microsoft.com/download/symbols` | 符号路径 |
| `-i C:\app\bin` | 镜像路径 |
| `-lines` | 源行信息 |
| `.symfix` | 设置微软符号服务器 |
| `.sympath` | 显示/设置符号路径 |
| `.reload` | 重新加载符号 |
| `.reload /f` | 强制加载 |
| `!sym noisy` | 符号诊断 |
| `!lmi 模块` | 模块符号详情 |
| `lm` / `lmv` / `lmf` | 模块列表 |
| `!dh 模块` | PE 头 |
| `!dlls` | 用户态模块列表 |
| `!chkimg -d 模块` | 代码校验 |

### 19.2 异常与第一现场

| 命令 | 作用 |
|---|---|
| `!analyze -v` | 自动分析 |
| `!analyze -hang` | 挂起分析 |
| `!analyze -show 0x9F` | bugcheck 说明 |
| `.lastevent` | 最后事件 |
| `.exr` / `.exr -1` | 异常记录 |
| `.cxr` | 上下文记录 |
| `.ecxr` | 切到异常上下文 |
| `.bugcheck` | 蓝屏码与参数 |
| `!error 0xC0000005` | 解码错误码 |
| `!gle` | 最后错误 |

### 19.3 线程与栈

| 命令 | 作用 |
|---|---|
| `~` | 线程列表 |
| `~0s` | 切到 0 号线程 |
| `~*k` | 所有线程栈 |
| `~*kb` | 所有线程栈 + 参数 |
| `~*e !clrstack` | 所有线程托管栈 |
| `k` / `kb` / `kp` / `kv` / `kn` | 栈 |
| `.frame N` | 切帧 |
| `dv` | 局部变量 |
| `dps @rsp` | 手动走栈（x64） |
| `dds @esp` | 手动走栈（x86） |
| `!dumpstack` | 更完整的栈 |
| `!stacks 2` | 内核所有线程栈 |
| `!runaway` | 线程 CPU 时间 |
| `!threadpool` | 线程池 |
| `!threads` | 托管线程 |

### 19.4 内存与对象

| 命令 | 作用 |
|---|---|
| `!address -summary` | 地址空间汇总 |
| `!address 地址` | 区域详情 |
| `!vprot 地址` | 页保护 |
| `!heap -s` | 堆摘要 |
| `!heap -p -a 地址` | 页堆查地址 |
| `!handle 0 f` | 所有句柄 |
| `!cs -l` | 所有临界区 |
| `!locks` | 内核资源锁 |
| `!pte 地址` | 页表项（内核） |
| `!pool 地址` | 池块（内核） |
| `!poolused 2` | 池统计（内核） |
| `s -a/-u/-b/-w/-d` | 搜索 |
| `da/du/dc/dd/dq/dp/dpp/dds/dps` | 显示 |

### 19.5 代码与类型

| 命令 | 作用 |
|---|---|
| `u 地址` | 反汇编 |
| `uf 函数` | 整个函数 |
| `ub 地址` | 向前反汇编 |
| `r` | 寄存器 |
| `dt 类型 地址` | 结构体 |
| `dt -r` | 递归 |
| `dt -b` | 位域 |
| `dx @$curprocess` | 进程对象 |
| `dx @$curthread` | 线程对象 |
| `x 模块!符号` | 查找符号 |
| `ln 地址` | 最近符号 |
| `?? 表达式` | C++ 表达式 |

### 19.6 内核

| 命令 | 作用 |
|---|---|
| `!process 0 0` | 所有进程 |
| `!process 地址 7` | 进程详情 |
| `.process 地址` | 切进程 |
| `!thread 地址` | 线程详情 |
| `!drvobj 驱动 2` | 驱动对象 |
| `!devobj 设备` | 设备对象 |
| `!devstack 设备` | 设备栈 |
| `!irp 地址` | IRP |
| `!irpfind` | 找 IRP |
| `!poaction` | 电源动作 |
| `!vm` | 虚拟内存 |
| `!memusage` | 物理内存 |
| `!pcr` | PCR |
| `!sysinfo` | 系统信息 |
| `!whea` / `!errrec` | 硬件错误 |
| `!verifier 3` | 驱动验证 |
| `!blackboxbsod` | 蓝屏黑匣子 |

### 19.7 托管

| 命令 | 作用 |
|---|---|
| `.loadby sos clr` | 加载 SOS（Framework） |
| `.loadby sos coreclr` | 加载 SOS（Core） |
| `!threads` | 托管线程 |
| `!clrstack` | 托管栈 |
| `!pe` | 异常对象 |
| `!dumpheap -stat` | 堆统计 |
| `!gcroot 地址` | GC 根 |
| `!do 地址` | 对象 |
| `!syncblk` | 锁竞争 |
| `!eeheap -gc` | GC 堆 |

---

## 20. 练习与自测

<details>
<summary>1. 打开 dump 后，为什么建议先 `.ecxr` 再 `kv`？</summary>

`.ecxr` 把上下文切到异常记录对应的线程和寄存器；不做这一步，看到的栈可能不是崩溃瞬间的栈。
</details>

<details>
<summary>2. `!analyze -v` 里的 “Probably caused by” 可以直接当结论吗？</summary>

不能。它经常指向“最后碰坏数据的人”或受害者，需要结合 `kv`、`lm` 和反汇编确认。
</details>

<details>
<summary>3. `lm` 和 `lmv` 的区别？</summary>

`lm` 列出模块；`lmv` 显示详细模式，包括时间戳、镜像大小、符号类型、PDB 路径等。
</details>

<details>
<summary>4. 如何看所有线程的栈？</summary>

`~*k`（带参数用 `~*kb`）。托管代码可用 `~*e !clrstack`。
</details>

<details>
<summary>5. 如何切换到 1 号线程？</summary>

`~1s`。
</details>

<details>
<summary>6. `kv` 输出里的 `Child-SP` 和 `RetAddr` 是什么？</summary>

`Child-SP` 是当前帧的栈指针；`RetAddr` 是返回地址，即下一帧中调用指令之后的位置。
</details>

<details>
<summary>7. 栈显示 “Stack unwind information not available” 怎么办？</summary>

先试 `kv`；再用 `dps @rsp`（x64）或 `dds @esp`（x86）手动找返回地址，用 `ln` 识别符号；必要时 `uf` 看函数序言确认栈帧。
</details>

<details>
<summary>8. 0xC0000005 的 `EXCEPTION_PARAMETER1` 为 1 表示什么？</summary>

写访问违例（0=读，1=写，8=执行）。
</details>

<details>
<summary>9. 如何查看某个地址属于哪个模块/区域？</summary>

`!address 地址` 看区域；`!vprot 地址` 看页保护；`ln 地址` 看最近符号。
</details>

<details>
<summary>10. 用户态堆分析用什么命令？</summary>

`!heap -s`、`!heap -a`、`!heap -stat`、`!heap -p -a`；后者需要 Page Heap。
</details>

<details>
<summary>11. 如何列出所有句柄？</summary>

`!handle 0 f`；看某个句柄详情用 `!handle <值> f`。
</details>

<details>
<summary>12. 如何看临界区被谁持有？</summary>

`!cs -l` 列出所有临界区，重点看 `OwningThread`；`!cs -s <地址>` 看单个。
</details>

<details>
<summary>13. 内核 dump 的 0x9F 先看什么？</summary>

`!analyze -v` → `!poaction` → `!irpfind` → `!devstack` / `!drvobj`，找阻塞的 power IRP 和驱动。
</details>

<details>
<summary>14. `.bugcheck` 和 `!analyze -v` 的关系？</summary>

`.bugcheck` 直接显示蓝屏码和四个参数；`!analyze -v` 会解释并给出栈和驱动线索。
</details>

<details>
<summary>15. minidump 为什么不能做堆分析？</summary>

minidump 只保留线程、模块、栈和少量内存，不包含完整堆；需要 full dump（`.dump /ma`）。
</details>

<details>
<summary>16. 32 位进程的 dump 应该用哪个 cdb？</summary>

优先 `x86\cdb.exe`；位数不匹配会导致模块/栈/上下文异常。
</details>

<details>
<summary>17. 如何生成用户态 full dump？</summary>

`.dump /ma C:\dumps\app.dmp`，或用 `procdump -ma`。
</details>

<details>
<summary>18. `!process 0 0` 和 `!process <addr> 7` 的区别？</summary>

`!process 0 0` 列出所有进程；`!process <addr> 7` 显示指定进程的详细信息和线程/栈。
</details>

<details>
<summary>19. `!lmi` 和 `!dh` 的区别？</summary>

`!lmi` 看模块加载与符号信息；`!dh` 看 PE 头、节表、入口点等镜像结构。
</details>

<details>
<summary>20. 如何确认符号是否真的匹配？</summary>

`!lmi 模块` 或 `lmv` 看 PDB signature（GUID+Age）、时间戳、镜像大小；必要时 `!sym noisy` + `.reload /f`。
</details>

---

## 附：分析记录模板

```text
【基本信息】
Dump 文件：
抓取方式：WER / procdump / 任务管理器 / cdb
系统版本：
进程名/版本：
模块版本：
符号状态：公共符号 / 私有符号 / 无符号

【异常】
异常码：
异常参数：
故障地址：
故障指令：
访问类型：读 / 写 / 执行

【现场】
故障线程：
调用栈（前 10 帧）：
相关模块：
是否 .NET：

【旁证】
所有线程状态：
锁/等待链：
堆/句柄/内存异常：
最近安装的软件/驱动：

【结论】
直接原因：
根本原因：
修复建议：
复现方式：
```

> 最后一句：**cdb 的命令很多，但日常分析 80% 的场景只需要 `!analyze -v`、`.ecxr`、`kv`、`lm`、`~*k`、`!cs -l`、`!heap -s` 这几条。先把这条主线走顺，再按需查表。**
