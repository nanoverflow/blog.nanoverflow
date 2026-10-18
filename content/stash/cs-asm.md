---
title: cs-asm
description: cheat sheet for asm
---


# 汇编 · 链接 · 装载 速查手册

> 《程序员的自我修养——链接、装载与库》
> 《嵌入式C语言自我修养：从芯片、编译器到操作系统》
> 约定：x86-64 默认 AT&T 语法（GCC）；ARM 覆盖 ARMv7 / Cortex-M 与 AArch64；示例是“编译器可能生成的形态”，用于理解，不保证逐字节一致。

## 目录

0. 两本书的知识地图
1. 寄存器模型
2. 汇编语法：AT&T vs Intel
3. x86-64 指令速查
4. 寻址方式
5. 函数调用、栈帧与 ABI
6. 从 C 到汇编：常见构造对照
7. 编译、汇编、链接全流程
8. ELF 目标文件速查
9. 静态链接
10. 动态链接：PIC / GOT / PLT
11. 装载与进程地址空间
12. 嵌入式专题：启动、链接脚本、中断
13. 内联汇编与编译器屏障
14. 工具链命令卡
15. x86-64 指令编码入门
16. 易错点清单
17. 速记口诀
18. 自测 20 题

---

## 0. 两本书的知识地图

| 主题 | 《程序员的自我修养》 | 《嵌入式C语言自我修养》 | 本手册 |
|---|---|---|---|
| 编译 / 汇编 / 链接全流程 | 第 1–2 章 | 编译过程、汇编相关章节 | §7 |
| 目标文件 / ELF | 第 3 章 | 可执行文件与段 | §8 |
| 静态链接 / 链接脚本 | 第 4 章 | 链接脚本、启动流程 | §9 |
| 装载与进程 | 第 6 章 | 启动流程、内存布局 | §11 |
| 动态链接 / 共享库 | 第 7–9 章 | 共享库、位置无关代码 | §10 |
| 内存 / 运行库 | 第 10–11 章 | 堆、栈、内存管理 | §12 |
| 系统调用 / API | 第 12 章 | 系统调用、操作系统 | §3.9、§11 |
| 汇编与 ABI | 第 1、2 章穿插 | 汇编、中断、启动代码 | §1–§5 |

### 0.1 一张图记住全流程

```text
C 源码 .c
  │  预处理 cpp
  ▼
预处理文件 .i
  │  编译 cc1
  ▼
汇编源码 .s
  │  汇编 as
  ▼
可重定位目标文件 .o（ELF, ET_REL）
  │  链接 ld（静态链接）
  ▼
可执行文件 a.out（ET_EXEC，或 PIE 的 ET_DYN）
  │  装载 execve + ld.so（动态链接器）
  ▼
进程地址空间
  │  _start → __libc_start_main
  ▼
main()
```

### 0.2 三个核心问题

| 问题 | 关键词 | 对应内容 |
|---|---|---|
| 代码怎么变成可执行文件？ | 编译、汇编、符号、重定位 | §7–§9 |
| 可执行文件怎么跑起来？ | ELF、装载、虚拟地址、动态链接 | §8、§10、§11 |
| 嵌入式程序怎么从复位到 main？ | 向量表、启动代码、链接脚本、栈 | §12 |

> 一句话：**编译把 C 变成汇编，汇编把汇编变成机器码，链接把多个 .o 拼成一个地址确定的文件，装载把文件映射成进程。**

---

## 1. 寄存器模型

### 1.1 x86-64 通用寄存器

| 64 位 | 32 位 | 16 位 | 8 位 | 传统用途 | SysV ABI 角色 |
|---|---|---|---|---|---|
| `%rax` | `%eax` | `%ax` | `%al` / `%ah` | 累加器 | 返回值；可变参数时 `al` = 向量寄存器个数 |
| `%rbx` | `%ebx` | `%bx` | `%bl` / `%bh` | 基址 | 被调用者保存 |
| `%rcx` | `%ecx` | `%cx` | `%cl` / `%ch` | 计数 | 第 4 个参数；`rep` 计数 |
| `%rdx` | `%edx` | `%dx` | `%dl` / `%dh` | 数据 | 第 3 个参数；`rdx:rax` 返回值/除法 |
| `%rsi` | `%esi` | `%si` | `%sil` | 源变址 | 第 2 个参数 |
| `%rdi` | `%edi` | `%di` | `%dil` | 目的变址 | 第 1 个参数 |
| `%rbp` | `%ebp` | `%bp` | `%bpl` | 帧指针 | 被调用者保存 |
| `%rsp` | `%esp` | `%sp` | `%spl` | 栈指针 | 特殊，始终指向栈顶 |
| `%r8`–`%r15` | `%r8d`–`%r15d` | `%r8w`–`%r15w` | `%r8b`–`%r15b` | 通用 | `r8`、`r9` 为第 5、6 个参数；`r10`、`r11` 调用者保存；`r12`–`r15` 被调用者保存 |
| `%rip` | — | — | — | 指令指针 | 下一条指令地址 |

**子寄存器规则（★）**

- 写 32 位寄存器会自动把高 32 位清零：`mov %eax, ...` 后 `rax` 高 32 位为 0。
- 写 8 位 / 16 位只改对应低位，其余位不变。
- `%ah`、`%bh`、`%ch`、`%dh` 不能与 REX 前缀（`%r8`–`%r15`、64 位操作）同时使用。

### 1.2 RFLAGS 常用标志

| 标志 | 名称 | 含义 | 典型来源 |
|---|---|---|---|
| CF | 进位 | 无符号溢出 / 借位 | `add`、`sub`、`cmp` |
| ZF | 零 | 结果为 0 | 几乎所有算术/逻辑指令 |
| SF | 符号 | 结果最高位为 1 | 算术指令 |
| OF | 溢出 | 有符号溢出 | 算术指令 |
| PF | 奇偶 | 低 8 位中 1 的个数为偶 | 算术指令 |
| AF | 辅助进位 | 低 4 位向高 4 位进位 | `add`、`sub` |
| DF | 方向 | 字符串操作方向（0 递增，1 递减） | `std` / `cld` |
| IF | 中断 | 可屏蔽中断开关 | `sti` / `cli` |

### 1.3 ARM32（ARMv7 / AAPCS）

| 寄存器 | 别名 | 用途 | AAPCS 角色 |
|---|---|---|---|
| `r0`–`r3` | — | 通用 | 参数 1–4 / 返回值 |
| `r4`–`r11` | — | 通用 | 被调用者保存 |
| `r12` | `ip` | 临时 | 调用者保存（过程内暂存） |
| `r13` | `sp` | 栈指针 | 8 字节对齐 |
| `r14` | `lr` | 链接寄存器 | 保存返回地址 |
| `r15` | `pc` | 程序计数器 | 读 PC 有流水线偏移 |
| `cpsr` | — | 当前程序状态 | N Z C V、I F T、模式位 |

**CPSR 常用位**

| 位 | 名称 | 含义 |
|---|---|---|
| 31 | N | 负数 |
| 30 | Z | 零 |
| 29 | C | 进位 / 借位 |
| 28 | V | 有符号溢出 |
| 7 | I | IRQ 屏蔽 |
| 6 | F | FIQ 屏蔽 |
| 5 | T | Thumb 状态 |
| 4:0 | M | 处理器模式 |

**ARM 模式**：User、FIQ、IRQ、Supervisor（SVC）、Abort、Undefined、System。不同模式有自己 banked 的 `sp` / `lr`，异常切换时硬件自动换栈。

### 1.4 ARM64（AArch64 / AAPCS64）

| 寄存器 | 用途 | ABI 角色 |
|---|---|---|
| `x0`–`x7` | 通用 / 参数 | 参数 1–8；`x0` 返回值 |
| `x8` | 间接结果 / 系统调用号 | 返回大结构体时传地址；`svc` 时放调用号 |
| `x9`–`x15` | 临时 | 调用者保存 |
| `x16` / `x17` | `ip0` / `ip1` | PLT / 链接器临时 |
| `x18` | 平台寄存器 | 平台相关，一般不要用 |
| `x19`–`x28` | 通用 | 被调用者保存 |
| `x29` | 帧指针 `fp` | 被调用者保存 |
| `x30` | 链接寄存器 `lr` | 保存返回地址 |
| `sp` | 栈指针 | 16 字节对齐 |
| `pc` | 程序计数器 | 不能直接写 |
| `w0`–`w30` | 32 位视图 | 写 `wN` 清零 `xN` 高 32 位 |

**状态寄存器**：`NZCV`（条件标志）、`DAIF`（调试/SError/IRQ/FIQ 屏蔽）、`SP_EL0`、`ELR`、`SPSR`。

### 1.5 Cortex-M 特殊寄存器

| 名称 | 作用 |
|---|---|
| `MSP` | 主栈指针（复位后默认） |
| `PSP` | 进程栈指针（RTOS 常用） |
| `xPSR` | 组合状态：APSR（N/Z/C/V/Q）、IPSR（异常号）、EPSR（T 位等） |
| `PRIMASK` | 置 1 屏蔽所有可配置优先级中断 |
| `FAULTMASK` | 置 1 屏蔽 HardFault 以外的异常 |
| `BASEPRI` | 屏蔽低于某优先级的中断 |
| `CONTROL` | 选择 MSP/PSP、特权/非特权 |
| `NVIC` | 中断使能、挂起、优先级 |
| `SCB` | 系统控制块：VTOR、AIRCR、SHPR 等 |
| `SysTick` | 系统定时器：LOAD / VAL / CTRL |

> 一句话：**x86 记 “di si dx cx, r8 r9” 六个参数；ARM32 记 r0–r3 传参、r4–r11 保存、lr 存返回；ARM64 记 x0–x7 传参、x19–x28 保存。**

---

## 2. 汇编语法：AT&T vs Intel

| 项目 | AT&T（GCC 默认） | Intel（MASM / NASM / `-masm=intel`） |
|---|---|---|
| 操作数顺序 | `指令 源, 目的` | `指令 目的, 源` |
| 寄存器 | `%rax` | `rax` |
| 立即数 | `$0x10` | `0x10` 或 `10h` |
| 内存 | `8(%rax,%rbx,4)` | `[rax+rbx*4+8]` |
| 间接跳转 | `jmp *%rax` | `jmp rax` |
| 大小后缀 | `movb` / `movw` / `movl` / `movq` | `mov byte ptr` / `word ptr` / `dword ptr` / `qword ptr` |
| 注释 | `#` | `;` |

**AT&T 示例**

```asm
movl  $1, %eax              # eax = 1
movq  %rax, %rbx            # rbx = rax
movl  8(%rax,%rbx,4), %ecx  # ecx = *(int *)(rax + rbx*4 + 8)
leaq  sym(%rip), %rdi       # rdi = &sym（RIP 相对）
```

**Intel 示例**

```asm
mov   eax, 1
mov   rbx, rax
mov   ecx, [rax+rbx*4+8]
lea   rdi, [rip+sym]
```

**后缀含义**

| 后缀 | 宽度 | C 类型示例 |
|---|---|---|
| `b` | 8 位 | `char` |
| `w` | 16 位 | `short` |
| `l` | 32 位 | `int` / `unsigned` |
| `q` | 64 位 | `long` / 指针 |

> 一句话：**AT&T 是“源左目的右”，Intel 是“目的左源右”；看到 `%` 和 `$` 就是 AT&T。**

---

## 3. x86-64 指令速查

### 3.1 数据传送

| 指令 | 说明 | 示例 |
|---|---|---|
| `mov` | 传送（不能内存→内存） | `mov %rax, %rbx` |
| `movabs` | 64 位立即数装入寄存器 | `movabs $0x1122334455667788, %rax` |
| `movz*` | 零扩展传送 | `movzbl %al, %eax` |
| `movs*` | 符号扩展传送 | `movsbq %al, %rax` |
| `movslq` | 32→64 符号扩展 | `movslq %eax, %rax` |
| `cltq` | `eax` 符号扩展到 `rax` | `cltq` |
| `lea` | 取有效地址（不访存、不改标志） | `leaq 8(%rax,%rbx,4), %rcx` |
| `xchg` | 交换（带内存时隐含 lock） | `xchg %rax, %rbx` |
| `push` | 压栈：`rsp -= 8`，再写 | `push %rbp` |
| `pop` | 出栈：读，再 `rsp += 8` | `pop %rbp` |
| `cmovcc` | 条件传送（比分支更稳） | `cmovg %esi, %eax` |

#### LEA 与 MOV 的区别

| 指令                | 行为                                 | 示例               | 结果                        |
| ------------------- | ------------------------------------ | ------------------ | --------------------------- |
| **LEA reg, [expr]** | 计算地址表达式，将结果写入寄存器     | `lea eax, [ebx+8]` | `eax = ebx + 8`（不读内存） |
| **MOV reg, [expr]** | 读取内存，将该地址处的内容写入寄存器 | `mov eax, [ebx+8]` | `eax = *(ebx+8)`（读内存）  |

### 3.2 算术

| 指令 | 说明 | 示例 |
|---|---|---|
| `add` | 加法 | `add $8, %rsp` |
| `sub` | 减法 | `sub $0x10, %rsp` |
| `inc` / `dec` | 自增 / 自减 | `inc %rcx` |
| `neg` | 取负 | `neg %rax` |
| `imul` | 有符号乘（1/2/3 操作数） | `imul $3, %rsi, %rax` |
| `mul` | 无符号乘（`rdx:rax`） | `mul %rcx` |
| `idiv` | 有符号除（`rdx:rax / 操作数`） | `idiv %rcx` |
| `div` | 无符号除 | `div %rcx` |
| `cdq` / `cltd` | `eax` 符号扩展到 `edx:eax` | `cdq` |
| `cqo` / `cqto` | `rax` 符号扩展到 `rdx:rax` | `cqo` |
| `adc` / `sbb` | 带进位加 / 带借位减 | `adc $0, %rax` |

**除法三步（★）**

```asm
cqo             # 把 rax 的符号扩展到 rdx（无符号除法用 xor %edx,%edx）
idiv %rcx       # rax = 商，rdx = 余数
```

### 3.3 逻辑与移位

| 指令 | 说明 | 示例 |
|---|---|---|
| `and` | 按位与 | `and $0xff, %eax` |
| `or` | 按位或 | `or %rsi, %rax` |
| `xor` | 按位异或；`xor %eax,%eax` 是清零惯用法 | `xor %eax, %eax` |
| `not` | 按位取反 | `not %rax` |
| `test` | 按位与，只改标志 | `test %rax, %rax` |
| `shl` / `sal` | 左移 | `shl $2, %eax` |
| `shr` | 逻辑右移（高位补 0） | `shr $1, %eax` |
| `sar` | 算术右移（高位补符号） | `sar $3, %eax` |
| `rol` / `ror` | 循环左 / 右移 | `rol $8, %eax` |
| `rcl` / `rcr` | 带进位循环移位 | `rcl $1, %eax` |

### 3.4 比较与跳转

| 指令 | 说明 |
|---|---|
| `cmp 源, 目的` | 计算 `目的 - 源`，只改标志 |
| `jmp` | 无条件跳转 |
| `jcc` | 条件跳转（见下表） |
| `loop` | `rcx--`，非零则跳 |
| `jrcxz` | `rcx == 0` 则跳 |

**条件跳转（★ 有符号看 SF/OF，无符号看 CF/ZF）**

| 指令 | 条件 | 含义 |
|---|---|---|
| `je` / `jz` | `ZF=1` | 相等 / 为零 |
| `jne` / `jnz` | `ZF=0` | 不等 / 非零 |
| `jg` / `jnle` | `ZF=0 且 SF=OF` | 有符号大于 |
| `jge` / `jnl` | `SF=OF` | 有符号大于等于 |
| `jl` / `jnge` | `SF≠OF` | 有符号小于 |
| `jle` / `jng` | `ZF=1 或 SF≠OF` | 有符号小于等于 |
| `ja` / `jnbe` | `CF=0 且 ZF=0` | 无符号大于 |
| `jae` / `jnb` / `jnc` | `CF=0` | 无符号大于等于 |
| `jb` / `jnae` / `jc` | `CF=1` | 无符号小于 |
| `jbe` / `jna` | `CF=1 或 ZF=1` | 无符号小于等于 |
| `js` / `jns` | `SF=1` / `SF=0` | 符号 / 非负 |
| `jo` / `jno` | `OF=1` / `OF=0` | 溢出 / 未溢出 |
| `jp` / `jnp` | `PF=1` / `PF=0` | 奇偶 |

> 记忆：**“g/l 是给有符号数的，a/b 是给无符号数的”**；`jg` 看 `SF=OF`，`ja` 看 `CF=0`。

### 3.5 栈与函数

| 指令 | 说明 |
|---|---|
| `call` | 压入返回地址，跳转 |
| `ret` | 弹出返回地址，跳回 |
| `leave` | `mov %rbp,%rsp; pop %rbp`（等价于销毁栈帧） |
| `enter $N,$0` | 建立栈帧（现代编译器很少用） |
| `nop` | 空操作（对齐、打补丁） |
| `endbr64` | CET 间接跳转合法目标标记 |
| `syscall` | 进入内核（x86-64） |
| `int $0x80` | 32 位系统调用入口 |
| `hlt` | 停机（特权指令） |

### 3.6 字符串操作

| 指令 | 说明 |
|---|---|
| `movsb/movsw/movsl/movsq` | 复制 `DS:[rsi]` → `ES:[rdi]` |
| `stosb/stosw/stosl/stosq` | 把 `al/ax/eax/rax` 写入 `[rdi]` |
| `lodsb/lodsw/lodsl/lodsq` | 从 `[rsi]` 读到累加器 |
| `cmpsb/cmpsw/cmpsl/cmpsq` | 比较 `[rsi]` 与 `[rdi]` |
| `scasb/scasw/scasl/scasq` | 比较累加器与 `[rdi]` |
| `rep` / `repe` / `repne` | 配合 `rcx` 重复 |
| `cld` / `std` | 清 / 设方向标志（ABI 要求 DF=0） |

### 3.7 位操作与原子

| 指令 | 说明 |
|---|---|
| `bt` / `bts` / `btr` / `btc` | 测试位 / 置位 / 清位 / 取反位 |
| `bsf` / `bsr` | 位扫描（从低 / 从高找第一个 1） |
| `popcnt` | 统计 1 的个数 |
| `lzcnt` / `tzcnt` | 前导零 / 尾随零个数 |
| `bswap` | 字节序翻转 |
| `lock` 前缀 | 让后续读-改-写指令原子化 |
| `xadd` | 交换并相加（原子计数常用） |
| `cmpxchg` | 比较并交换（`rax` 参与比较） |
| `cmpxchg16b` | 16 字节 CAS |

### 3.8 浮点 / SSE 常用

| 指令 | 说明 |
|---|---|
| `movss` / `movsd` | 标量单 / 双精度传送 |
| `movaps` / `movups` | 对齐 / 非对齐 16 字节传送 |
| `movdqa` / `movdqu` | 对齐 / 非对齐整数向量传送 |
| `addss` / `addsd` | 标量浮点加 |
| `mulss` / `mulsd` | 标量浮点乘 |
| `cvtsi2ss` / `cvtsi2sd` | 整数转浮点 |
| `cvttss2si` / `cvttsd2si` | 浮点截断转整数 |
| `pxor` | 向量异或（常用来清零） |
| `vzeroupper` | 清 AVX 高位，避免混合惩罚 |

> ⚠️ `movaps` 要求 16 字节对齐，栈没对齐会直接段错误（`-O2` 下常见）。

### 3.9 系统调用

| 项目 | x86-64 `syscall` | 32 位 `int $0x80` |
|---|---|---|
| 调用号 | `rax` | `eax` |
| 参数 1–6 | `rdi, rsi, rdx, r10, r8, r9` | `ebx, ecx, edx, esi, edi, ebp` |
| 返回 | `rax`（负值表示 `-errno`） | `eax` |
| 被破坏 | `rcx`、`r11` | — |
| 指令 | `syscall` | `int $0x80` |

**常用调用号（x86-64）**：`read=0`、`write=1`、`open=2`、`close=3`、`mmap=9`、`munmap=11`、`brk=12`、`execve=59`、`exit=60`、`clone=56`、`futex=202`。

> 一句话：**函数调用参数从 `rdi` 开始，系统调用参数从 `rdi` 开始但第 4 个是 `r10` 不是 `rcx`。**

---

## 4. 寻址方式

### 4.1 x86-64

| 形式 | 示例 | 有效地址 |
|---|---|---|
| 立即数 | `$0x10` | 无（就是常量） |
| 寄存器 | `%rax` | `rax` |
| 直接 | `0x400000` | 绝对地址（64 位下少用） |
| 间接 | `(%rax)` | `rax` |
| 基址 + 偏移 | `-8(%rbp)` | `rbp - 8` |
| 基址 + 变址 | `(%rax,%rbx)` | `rax + rbx` |
| 比例变址 | `8(%rax,%rbx,4)` | `rax + 4*rbx + 8` |
| RIP 相对 | `sym(%rip)` | 下一条指令地址 + 偏移 |
| 段寄存器 | `%fs:0x28` | TLS / 栈保护 canary |

**比例因子只能是 1、2、4、8**，对应 `char`、`short`、`int`、`long`/指针。

### 4.2 ARM

| 形式 | 示例 | 说明 |
|---|---|---|
| 立即数 | `#0x10` | ARM32 受“8 位旋转”限制 |
| 寄存器 | `r0` | — |
| 寄存器间接 | `[r0]` | 取 `*r0` |
| 前索引 | `[r0, #4]` | 地址 `r0+4`，不改 `r0` |
| 前索引写回 | `[r0, #4]!` | 地址 `r0+4`，并更新 `r0` |
| 后索引 | `[r0], #4` | 先用 `r0`，再 `r0 += 4` |
| 寄存器偏移 | `[r0, r1, LSL #2]` | `r0 + r1*4` |
| PC 相对 | `[pc, #0x100]` | 文字池 / 常量加载 |
| 多寄存器 | `{r0-r3, lr}` | `LDM` / `STM` |

> 一句话：**x86 的 `8(%rax,%rbx,4)` 就是 ARM 的 `[rax, rbx, LSL #2]` 再加偏移。**

---

## 5. 函数调用、栈帧与 ABI

### 5.1 System V AMD64（Linux / macOS）

| 项目 | 规则 |
|---|---|
| 整数参数 | `rdi, rsi, rdx, rcx, r8, r9` |
| 浮点参数 | `xmm0`–`xmm7` |
| 第 7 个起 | 从右向左压栈 |
| 返回值 | `rax`；128 位用 `rdx:rax`；浮点用 `xmm0` |
| 栈对齐 | `call` 前 `rsp % 16 == 0`；函数入口 `rsp % 16 == 8` |
| 红区 | `rsp` 以下 128 字节，叶子函数可直接用 |
| 可变参数 | `al` = 使用的向量寄存器个数 |
| 方向标志 | 必须为 0（`cld`） |
| x87 | 进入/退出时栈必须为空 |

**寄存器保存责任**

| 类别 | 寄存器 |
|---|---|
| 调用者保存（caller-saved） | `rax, rcx, rdx, rsi, rdi, r8, r9, r10, r11` |
| 被调用者保存（callee-saved） | `rbx, rbp, r12, r13, r14, r15, rsp` |

### 5.2 栈帧布局（★）

```text
        高地址
        ┌──────────────────────────┐
        │ 调用者的栈帧              │
        ├──────────────────────────┤
 rbp+16 │ 第 7 个及以后的参数        │
        ├──────────────────────────┤
 rbp+8  │ 返回地址（call 压入）      │
        ├──────────────────────────┤
 rbp    │ 保存的旧 rbp              │ ← rbp 指向这里
        ├──────────────────────────┤
 rbp-8  │ 局部变量 / 保存的寄存器    │
        │ ...                      │
        ├──────────────────────────┤
 rsp    │ 当前栈顶                  │
        ├──────────────────────────┤
        │ 红区 128 字节（叶子函数）  │
        └──────────────────────────┘
        低地址
```

**标准序言 / 尾声**

```asm
push %rbp              # 保存旧帧指针
mov  %rsp, %rbp        # 建立新帧
sub  $N, %rsp          # 分配局部变量（N 通常 16 的倍数）
...
leave                  # mov %rbp,%rsp; pop %rbp
ret
```

开启优化后常见“无帧指针”版本：直接 `sub $N,%rsp`，用 `rsp` 相对寻址，`rbp` 被释放为通用寄存器。

**栈保护（canary）**

```asm
mov  %fs:0x28, %rax    # 取 canary
mov  %rax, -0x8(%rbp)
...
xor  %fs:0x28, %rax
jne  __stack_chk_fail
```

### 5.3 Windows x64

| 项目 | 规则 |
|---|---|
| 整数参数 | `rcx, rdx, r8, r9` |
| 浮点参数 | `xmm0`–`xmm3` |
| 影子空间 | 调用者必须在栈上留 32 字节 |
| 返回值 | `rax` / `xmm0` |
| 被调用者保存 | `rbx, rbp, rdi, rsi, r12`–`r15`, `xmm6`–`xmm15` |
| 栈对齐 | 16 字节 |

### 5.4 ARM ABI

**ARM32 AAPCS**

| 项目 | 规则 |
|---|---|
| 参数 | `r0`–`r3`，多余压栈 |
| 返回 | `r0`（64 位用 `r0:r1`） |
| 被调用者保存 | `r4`–`r11` |
| 特殊 | `r12` 临时、`r13` 栈、`r14` 返回地址、`r15` PC |
| 栈对齐 | 公开接口 8 字节 |

**AArch64 AAPCS64**

| 项目 | 规则 |
|---|---|
| 参数 | `x0`–`x7`，多余压栈 |
| 返回 | `x0`（128 位用 `x0:x1`） |
| 被调用者保存 | `x19`–`x28`、`x29`（fp）、`x30`（lr 由调用者保存） |
| 栈对齐 | 16 字节 |

**结构体传参（简述）**

- SysV：≤16 字节按“八个字节”分类，能进寄存器就进 `rdi/rsi/...` 或 `xmm`；>16 字节走栈。
- 返回大结构体：调用者传入隐藏指针（`sret`），`rdi` 常被占用。
- Windows x64：1/2/4/8 字节按值进寄存器，其他按引用。
- ARM：小结构体可拆进 `r0`–`r3`，大结构体走栈或隐藏指针。

> 一句话：**序言三件事“存 rbp、立 rbp、减 rsp”；尾声一件“leave”；返回值永远先看 `rax`。**

---

## 6. 从 C 到汇编：常见构造对照

### 6.0 读反汇编七步法

1. 找函数入口：符号名或 `endbr64` / `push %rbp`。
2. 看序言：分配了多大栈（`sub $N,%rsp`），保存了哪些寄存器。
3. 认参数：`rdi, rsi, rdx, rcx, r8, r9` 对应第 1–6 个参数。
4. 找循环：向后跳转的 `jcc` + 计数器。
5. 找分支：`cmp/test` 后紧跟条件跳转。
6. 找调用：`call`，返回值在 `rax`；注意 `call` 前的参数准备。
7. 找返回：`ret` 前 `rax` / `xmm0` 被写入的位置。

### 6.1 函数调用

```c
long add(long a, long b) { return a + b; }
```

```asm
add:
    leaq (%rdi,%rsi), %rax
    ret
```

### 6.2 if / 三元：常见 `cmov`

```c
int max(int a, int b) { return a > b ? a : b; }
```

```asm
max:
    cmp  %esi, %edi      # edi - esi
    mov  %esi, %eax
    cmovg %edi, %eax     # 若 a > b，eax = a
    ret
```

**分支 vs 条件传送**：`cmov` 没有分支预测失败，但源操作数必须能安全求值；有副作用或可能缺页时编译器仍用分支。

### 6.3 循环

```c
int sum(const int *a, int n) {
    int s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
```

```asm
sum:
    xor  %eax, %eax       # s = 0
    xor  %ecx, %ecx       # i = 0
    test %esi, %esi
    jle  .L2
.L1:
    add  (%rdi,%rcx,4), %eax
    inc  %rcx
    cmp  %esi, %ecx
    jl   .L1
.L2:
    ret
```

### 6.4 switch：跳转表

```c
int f(int x) {
    switch (x) {
    case 0: return 10;
    case 1: return 20;
    case 2: return 30;
    default: return -1;
    }
}
```

```asm
f:
    cmp  $2, %edi
    ja   .Ldefault
    lea  .Ltable(%rip), %rdx
    movslq (%rdx,%rdi,4), %rax
    add  %rdx, %rax
    jmp  *%rax
.Ltable:
    .long .Lcase0 - .Ltable
    .long .Lcase1 - .Ltable
    .long .Lcase2 - .Ltable
```

**识别特征**：`jmp *%rax` + 一张 `.long` 偏移表（PIE 下是相对偏移，不是绝对地址）。

### 6.5 结构体：偏移与填充

```c
struct S { char c; int i; double d; };
int get_i(struct S *s) { return s->i; }
```

```asm
get_i:
    mov 4(%rdi), %eax
    ret
```

| 成员 | 偏移 | 大小 |
|---|---|---|
| `c` | 0 | 1 |
| padding | 1–3 | 3 |
| `i` | 4 | 4 |
| `d` | 8 | 8 |
| 总大小 | 16 | — |

**对齐规则**：每个成员对齐到自身大小（或 `#pragma pack` 指定值）；结构体总大小对齐到最大成员对齐；数组元素之间不能有“尾部空洞”以外的额外填充。

### 6.6 数组与指针

```c
int get(int *a, int i) { return a[i]; }
```

```asm
get:
    movslq %esi, %rsi
    mov    (%rdi,%rsi,4), %eax
    ret
```

- `a[i]` = `*(a + i)` = `base + i*sizeof(T)`。
- 指针减法结果单位是“元素个数”，不是字节数。
- 二维数组 `int a[3][4]`：`a[i][j]` = `base + (i*4 + j)*4`。

### 6.7 全局变量与 PIC

```c
extern int g;
int read_g(void) { return g; }
```

非 PIC / 本模块可见：

```asm
read_g:
    mov g(%rip), %eax
    ret
```

共享库 / 外部可见（PIC）：

```asm
read_g:
    mov g@GOTPCREL(%rip), %rax
    mov (%rax), %eax
    ret
```

### 6.8 volatile

```c
volatile int *p;
*p = 1;
```

```asm
    movl $1, (%rax)      # 每次访问都真的读写，不会被优化掉
```

⚠️ `volatile` 只保证“不被优化掉 / 顺序大致保留”，**不保证原子性，也不保证 CPU 级内存序**；多核/中断共享数据要配原子操作或屏障。

> 一句话：**看到 `lea` 先想“算地址”，看到 `cmov` 想“无分支三目”，看到 `jmp *%rax` 想“跳转表或虚函数”。**

---

## 7. 编译、汇编、链接全流程

| 阶段 | 工具 | 输入 | 输出 | GCC 选项 |
|---|---|---|---|---|
| 预处理 | `cpp` | `.c` / `.h` | `.i` | `-E` |
| 编译 | `cc1` | `.i` | `.s` | `-S` |
| 汇编 | `as` | `.s` | `.o` | `-c` |
| 链接 | `ld`（collect2 调） | `.o` / `.a` / `.so` | 可执行文件 | 无（默认） |

```bash
gcc -E hello.c -o hello.i          # 预处理
gcc -S hello.c -o hello.s          # 编译成汇编
gcc -c hello.s -o hello.o          # 汇编成目标文件
gcc hello.o -o hello               # 链接
gcc -v hello.c -o hello            # 看完整命令链
gcc --save-temps hello.c           # 保留所有中间文件
```

**目标文件三兄弟**

| 类型 | `e_type` | 例子 | 特点 |
|---|---|---|---|
| 可重定位 | `ET_REL` | `.o` | 地址未定，含重定位表 |
| 可执行 | `ET_EXEC` | 非 PIE 的 `a.out` | 地址固定 |
| 共享对象 | `ET_DYN` | `.so`、PIE 可执行文件 | 位置无关，可被装载到任意基址 |
| Core | `ET_CORE` | `core` | 进程崩溃现场 |

> 一句话：**`.c → .i → .s → .o → a.out`，对应 `-E -S -c 链接`。**

---

## 8. ELF 目标文件速查

### 8.1 ELF 头

```c
typedef struct {
    unsigned char e_ident[16];   // 魔数、位数、字节序、ABI
    uint16_t e_type;             // ET_REL / ET_EXEC / ET_DYN / ET_CORE
    uint16_t e_machine;          // EM_X86_64=62, EM_ARM=40, EM_AARCH64=183
    uint32_t e_version;
    uint64_t e_entry;            // 入口地址
    uint64_t e_phoff;            // 程序头表偏移
    uint64_t e_shoff;            // 节头表偏移
    uint32_t e_flags;
    uint16_t e_ehsize;
    uint16_t e_phentsize, e_phnum;
    uint16_t e_shentsize, e_shnum, e_shstrndx;
} Elf64_Ehdr;
```

**`e_ident` 关键字节**

| 下标 | 名称 | 含义 |
|---|---|---|
| 0–3 | `EI_MAG` | `0x7f 'E' 'L' 'F'` |
| 4 | `EI_CLASS` | 1=32 位，2=64 位 |
| 5 | `EI_DATA` | 1=小端，2=大端 |
| 6 | `EI_VERSION` | 固定 1 |
| 7 | `EI_OSABI` | 0=System V，3=Linux |
| 8 | `EI_ABIVERSION` | ABI 版本 |

### 8.2 常见节（section）

| 节名 | 类型 | 标志 | 内容 |
|---|---|---|---|
| `.text` | PROGBITS | A+X | 机器指令 |
| `.rodata` | PROGBITS | A | 只读常量、字符串、跳转表 |
| `.data` | PROGBITS | A+W | 已初始化全局/静态变量 |
| `.bss` | NOBITS | A+W | 未初始化全局/静态变量（不占文件空间，装载时清零） |
| `.symtab` | SYMTAB | — | 符号表（链接用） |
| `.strtab` | STRTAB | — | 符号名字符串表 |
| `.shstrtab` | STRTAB | — | 节名字符串表 |
| `.rela.text` | RELA | — | 代码段重定位表 |
| `.rela.data` | RELA | — | 数据段重定位表 |
| `.debug_*` | PROGBITS | — | 调试信息（DWARF） |
| `.init` / `.fini` | PROGBITS | A+X | 进程/模块初始化、结束代码 |
| `.init_array` / `.fini_array` | INIT_ARRAY | A+W | 构造函数/析构函数指针数组 |
| `.plt` | PROGBITS | A+X | PLT 跳板 |
| `.got` / `.got.plt` | PROGBITS | A+W | 全局偏移表 |
| `.dynamic` | DYNAMIC | A+W | 动态链接信息 |
| `.dynsym` / `.dynstr` | DYNSYM / STRTAB | A | 动态符号表 / 字符串表 |
| `.interp` | PROGBITS | A | 动态链接器路径 |
| `.hash` / `.gnu.hash` | HASH | A | 符号哈希表 |
| `.eh_frame` | PROGBITS | A | 异常/栈展开信息 |
| `.comment` | PROGBITS | — | 编译器版本 |
| `.note.GNU-stack` | NOTE | — | 栈可执行性标记 |

**节 vs 段**

- **节（section）**：链接视图，按内容/权限细分，给链接器看。
- **段（segment）**：执行视图，按权限（R/W/X）合并，给装载器看。
- 一个 `PT_LOAD` 段通常包含多个节（如 `.text` + `.rodata`）。

### 8.3 程序头（segment）

| 类型 | 含义 |
|---|---|
| `PT_LOAD` | 需要映射到内存的段 |
| `PT_DYNAMIC` | 动态链接信息 |
| `PT_INTERP` | 动态链接器路径（如 `/lib64/ld-linux-x86-64.so.2`） |
| `PT_NOTE` | 附加信息 |
| `PT_PHDR` | 程序头表自身 |
| `PT_TLS` | 线程局部存储模板 |
| `PT_GNU_STACK` | 栈权限（是否可执行） |
| `PT_GNU_RELRO` | 重定位后只读区域 |
| `PT_GNU_EH_FRAME` | 异常处理帧 |

`p_flags`：`R=4`、`W=2`、`X=1`。

### 8.4 符号表

```c
typedef struct {
    uint32_t st_name;    // .strtab 中的偏移
    uint8_t  st_info;    // bind<<4 | type
    uint8_t  st_other;   // visibility
    uint16_t st_shndx;   // 所属节索引
    uint64_t st_value;   // 地址或偏移
    uint64_t st_size;    // 大小
} Elf64_Sym;
```

**绑定（bind）**：`LOCAL=0`、`GLOBAL=1`、`WEAK=2`、`GNU_UNIQUE=10`。
**类型（type）**：`NOTYPE=0`、`OBJECT=1`、`FUNC=2`、`SECTION=3`、`FILE=4`、`COMMON=5`、`TLS=6`。
**可见性（visibility）**：`DEFAULT=0`、`INTERNAL=1`、`HIDDEN=2`、`PROTECTED=3`。
**特殊节索引**：`SHN_UNDEF=0`（未定义）、`SHN_ABS=0xfff1`（绝对值）、`SHN_COMMON=0xfff2`（公共符号）。

### 8.5 重定位

```c
typedef struct {
    uint64_t r_offset;   // 需要修改的位置
    uint64_t r_info;     // 符号索引<<32 | 类型
    int64_t  r_addend;   // 加数
} Elf64_Rela;
```

**计算通式**：`结果 = S + A - P`（PC 相对）或 `S + A`（绝对）。其中 `S` 符号地址、`A` 加数、`P` 重定位位置。

| 类型 | 值 | 计算 | 用途 |
|---|---|---|---|
| `R_X86_64_64` | 1 | `S + A` | 64 位绝对地址 |
| `R_X86_64_PC32` | 2 | `S + A - P` | 32 位 PC 相对 |
| `R_X86_64_GOT32` | 3 | `G + A` | GOT 偏移 |
| `R_X86_64_PLT32` | 4 | `L + A - P` | 调用 PLT |
| `R_X86_64_COPY` | 5 | — | 复制符号（可执行文件复制共享库数据） |
| `R_X86_64_GLOB_DAT` | 6 | `S` | GOT 数据项 |
| `R_X86_64_JUMP_SLOT` | 7 | `S` | PLT 函数项 |
| `R_X86_64_RELATIVE` | 8 | `B + A` | PIE 基址相对 |
| `R_X86_64_GOTPCREL` | 9 | `G + GOT + A - P` | 取 GOT 项地址 |
| `R_X86_64_32` | 10 | `S + A` | 零扩展 32 位 |
| `R_X86_64_32S` | 11 | `S + A` | 符号扩展 32 位 |
| `R_X86_64_TPOFF64` | 18 | TLS 偏移 | 线程局部存储 |

### 8.6 查看命令

```bash
readelf -h a.out          # ELF 头
readelf -S a.out          # 节头表
readelf -l a.out          # 程序头（段）
readelf -s a.out          # 符号表
readelf -r a.out          # 重定位表
readelf -d a.out          # 动态节
readelf -x .data a.out    # 十六进制内容
objdump -d -M intel a.out # 反汇编
objdump -h a.out          # 节概览
objdump -t a.out          # 符号表
objdump -r a.out          # 重定位
nm -C a.out               # 符号（C++ 反修饰）
size a.out                # text/data/bss 大小
```

> 一句话：**`.text` 代码、`.data` 有初值、`.bss` 零初值、`.rodata` 只读、`.symtab` 符号、`.rela` 重定位。**

---

## 9. 静态链接

### 9.1 链接器做两件事（★）

1. **符号解析**：把每个符号的引用与符号表中的定义对应起来。
2. **重定位**：把引用处的地址改写成最终地址。

### 9.2 符号解析规则

| 情况 | 结果 |
|---|---|
| 多个强符号（函数/已初始化全局） | 报错 `multiple definition` |
| 强符号 + 弱符号 | 选强符号 |
| 多个弱符号 | 选第一个（或按链接顺序） |
| 未定义弱符号 | 解析为 0，不报错 |
| 未定义强符号 | 报错 `undefined reference` |
| `COMMON` 符号 | 分配最大尺寸（GCC 10 起默认 `-fno-common`，重复定义会报错） |

### 9.3 静态库与归档

```bash
ar rcs libfoo.a foo.o bar.o     # 创建静态库
ar t libfoo.a                   # 列出成员
ar x libfoo.a                   # 解出成员
ranlib libfoo.a                 # 建立索引（现代 ar s 已包含）
gcc main.o -L. -lfoo -o app     # 链接
```

**提取规则**：链接器从左到右扫描；只有“当前存在未定义符号”且“该成员能提供定义”时才把成员拉进来。单个归档内部会反复扫描，直到没有新成员被拉入；多个归档之间按命令行顺序，循环依赖用：

```bash
gcc main.o -Wl,--start-group -la -lb -Wl,--end-group
```

### 9.4 重定位过程

```text
.o 的 .text 中：call foo   →   e8 00 00 00 00（占位）
重定位表 .rela.text：offset=1, type=PLT32, sym=foo, addend=-4
链接后：call foo 的 disp32 = foo 的最终地址 - 下一条指令地址
```

### 9.5 地址分配

- 相似节合并：所有 `.text` 合并，所有 `.data` 合并。
- 计算每个段的 VMA（虚拟地址）。
- 符号地址 = 所在段基址 + 段内偏移。
- 默认链接脚本可用 `ld --verbose` 查看。

### 9.6 链接脚本（最小可用）

```ld
ENTRY(_start)
SECTIONS
{
    . = 0x400000;
    .text : { *(.text) }
    .rodata : { *(.rodata) }
    .data : { *(.data) }
    .bss : { *(.bss) *(COMMON) }
}
```

**嵌入式典型脚本（带 LMA/VMA）**

```ld
ENTRY(Reset_Handler)

MEMORY
{
    FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 512K
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
}

_estack = ORIGIN(RAM) + LENGTH(RAM);

SECTIONS
{
    .isr_vector : {
        KEEP(*(.isr_vector))
    } > FLASH

    .text : {
        *(.text*)
        *(.rodata*)
    } > FLASH

    .data : {
        _sdata = .;
        *(.data*)
        _edata = .;
    } > RAM AT > FLASH

    _sidata = LOADADDR(.data);

    .bss : {
        _sbss = .;
        *(.bss*)
        *(COMMON)
        _ebss = .;
    } > RAM
}
```

- `> RAM`：运行地址（VMA）在 RAM。
- `AT > FLASH`：加载地址（LMA）在 Flash，启动代码负责搬到 RAM。
- `LOADADDR(.data)`：取 `.data` 的加载地址（Flash 中的源地址）。

### 9.7 常用链接选项

| 选项 | 作用 |
|---|---|
| `-T script.ld` | 指定链接脚本 |
| `-Map=out.map` | 输出映射文件（段/符号地址） |
| `--gc-sections` | 回收未引用节（配合 `-ffunction-sections -fdata-sections`） |
| `-static` | 静态链接 |
| `-nostdlib` | 不链接标准库/启动文件 |
| `-nodefaultlibs` | 不链接默认库 |
| `-nostartfiles` | 不链接启动文件 |
| `-Wl,-e,entry` | 指定入口符号 |
| `-Wl,--whole-archive` | 强制拉入归档全部成员 |
| `-Wl,-r` | 可重定位链接（合并 .o，不分配最终地址） |

> 一句话：**链接 = 符号解析 + 重定位；静态库“按需拉取”，顺序敏感。**

---

## 10. 动态链接：PIC / GOT / PLT

### 10.1 为什么需要 PIC

共享库被多个进程映射到不同地址，代码段不能写死绝对地址。**位置无关代码（PIC）** 用“当前指令 + 偏移”或 GOT 表间接访问。

```bash
gcc -fPIC -shared foo.c -o libfoo.so
```

### 10.2 GOT 与 PLT（★）

- **GOT（Global Offset Table）**：存放“外部符号的最终地址”的数组，位于数据段，可写。
- **PLT（Procedure Linkage Table）**：每个外部函数一个跳板，位于代码段，只读。

```text
foo@plt:
    jmp  *foo@GOT(%rip)     # 第一次：GOT 指向下一条 push
    push $reloc_index       # 重定位索引
    jmp  PLT0               # 去解析器

PLT0:
    push GOT[1]             # link_map
    jmp  *GOT[2]            # _dl_runtime_resolve
```

**惰性绑定（lazy binding）**：第一次调用才解析，解析后把真实地址写回 GOT，之后直接跳。

- `GOT[0]` = `.dynamic` 地址
- `GOT[1]` = `link_map`
- `GOT[2]` = `_dl_runtime_resolve`

**关闭惰性绑定**：`-Wl,-z,now`、`LD_BIND_NOW=1`。

### 10.3 动态节常用项

| 项 | 含义 |
|---|---|
| `DT_NEEDED` | 依赖的共享库 |
| `DT_SONAME` | 共享库的“正式名字” |
| `DT_RPATH` / `DT_RUNPATH` | 搜索路径 |
| `DT_INIT` / `DT_FINI` | 初始化/结束函数 |
| `DT_INIT_ARRAY` / `DT_FINI_ARRAY` | 构造/析构数组 |
| `DT_STRTAB` / `DT_SYMTAB` | 动态字符串表 / 符号表 |
| `DT_RELA` / `DT_JMPREL` | 重定位表 / PLT 重定位表 |
| `DT_PLTREL` | PLT 重定位类型（`DT_RELA`） |
| `DT_HASH` / `DT_GNU_HASH` | 符号哈希 |
| `DT_FLAGS` / `DT_FLAGS_1` | 标记（BIND_NOW、ORIGIN 等） |

### 10.4 共享库的搜索顺序

1. `DT_RPATH`（旧，已被弃用；除非无 `RUNPATH`）
2. `LD_LIBRARY_PATH`
3. `DT_RUNPATH`
4. `/etc/ld.so.cache`
5. `/lib`、`/usr/lib`（及 64 位对应目录）

```bash
ldd app                     # 查看依赖（会执行 loader，注意安全）
readelf -d app | grep NEEDED
LD_DEBUG=libs,reloc,symbols ./app
LD_LIBRARY_PATH=./lib ./app
```

### 10.5 SONAME 与版本

```bash
gcc -shared -fPIC -Wl,-soname,libfoo.so.1 -o libfoo.so.1.2.3 foo.c
ln -s libfoo.so.1.2.3 libfoo.so.1
ln -s libfoo.so.1 libfoo.so      # 链接时用
```

- **链接时**找 `libfoo.so`。
- **运行时**按 `SONAME` 找 `libfoo.so.1`。
- 升级保持 ABI 兼容时只改小版本，`SONAME` 不变。

**符号版本脚本**

```ld
VER_1 {
    global: foo; bar;
    local: *;
};
```

```bash
gcc -shared -fPIC -Wl,--version-script=foo.map foo.c -o libfoo.so
```

### 10.6 导出控制

```c
__attribute__((visibility("default"))) void api(void);
```

```bash
gcc -fvisibility=hidden ...     # 默认全隐藏，只导出标注的
```

- `-rdynamic` / `-Wl,--export-dynamic`：把可执行文件符号加入动态符号表（backtrace 常用）。
- `-Wl,-Bsymbolic`：库内引用优先绑定到自身，避免被外部同名符号截胡（慎用）。

### 10.7 dlopen / dlsym

```c
#include <dlfcn.h>

void *h = dlopen("./libfoo.so", RTLD_NOW | RTLD_LOCAL);
if (!h) { fprintf(stderr, "%s\n", dlerror()); return 1; }

int (*fn)(int) = (int (*)(int))dlsym(h, "foo");
if (!fn) { /* dlerror */ }

dlclose(h);
```

| 标志 | 含义 |
|---|---|
| `RTLD_LAZY` / `RTLD_NOW` | 惰性 / 立即解析 |
| `RTLD_LOCAL` / `RTLD_GLOBAL` | 符号是否对后续库可见 |
| `RTLD_NODELETE` | 关闭时不卸载 |

链接需 `-ldl`（glibc 2.34 起并入 libc）。

### 10.8 静态库 vs 共享库

| 对比项 | 静态库 `.a` | 共享库 `.so` |
|---|---|---|
| 链接时机 | 链接时复制成员 | 运行时装载 |
| 体积 | 每个程序一份 | 多进程共享 |
| 更新 | 需重新链接 | 替换 `.so`（ABI 兼容） |
| 地址 | 可绝对寻址 | 需 PIC |
| 制作 | `ar rcs` | `gcc -shared -fPIC` |
| 依赖查看 | 无 | `ldd` / `readelf -d` |

> 一句话：**GOT 存地址，PLT 做跳板；第一次进解析器，之后直接跳。**

---

## 11. 装载与进程地址空间

### 11.1 execve 做了什么

1. 读 ELF 头，检查魔数、类型、机器。
2. 读程序头表，找到 `PT_LOAD`、`PT_INTERP`。
3. 为每个 `PT_LOAD` 建立虚拟内存映射（`mmap`），权限按 `p_flags`。
4. `p_memsz > p_filesz` 的部分（`.bss`）清零。
5. 映射动态链接器（`PT_INTERP`），设置入口为 `ld.so` 的入口。
6. 在栈上布置 `argc / argv / envp / auxv`。
7. 跳转到入口：动态链接时先跑 `ld.so`，再跳到程序 `_start`。

### 11.2 进程初始栈（★）

```text
        高地址
        ┌──────────────────────────┐
        │ 参数字符串、环境变量字符串  │
        ├──────────────────────────┤
        │ AT_NULL (0, 0)            │
        │ auxv 键值对 ...            │
        ├──────────────────────────┤
        │ NULL                      │
        │ envp[n-1] ... envp[0]     │
        ├──────────────────────────┤
        │ NULL                      │
        │ argv[argc-1] ... argv[0]  │
        ├──────────────────────────┤
        │ argc                      │ ← rsp
        └──────────────────────────┘
        低地址
```

**auxv 常用项**：`AT_PHDR=3`、`AT_PHENT=4`、`AT_PHNUM=5`、`AT_PAGESZ=6`、`AT_BASE=7`、`AT_ENTRY=9`、`AT_UID=11`、`AT_EUID=12`、`AT_GID=13`、`AT_EGID=14`、`AT_PLATFORM=15`、`AT_HWCAP=16`、`AT_CLKTCK=17`、`AT_SECURE=23`、`AT_RANDOM=25`、`AT_EXECFN=31`、`AT_SYSINFO_EHDR=33`。

### 11.3 `_start` 与 libc 启动

```asm
_start:
    xor  %ebp, %ebp
    mov  %rdx, %r9          # rtld_fini
    pop  %rsi               # argc
    mov  %rsp, %rdx         # argv
    and  $-16, %rsp
    push %rax
    push %rsp
    xor  %r8d, %r8d         # fini
    xor  %ecx, %ecx         # init
    lea  main(%rip), %rdi
    call *__libc_start_main@GOTPCREL(%rip)
    hlt
```

`__libc_start_main` 负责：初始化 TLS、设置栈保护、运行 `.init_array` 构造函数、调用 `main`、处理 `exit`。

### 11.4 虚拟地址空间布局

```text
高地址
┌──────────────────────┐
│ 内核空间              │
├──────────────────────┤
│ 栈（向下增长）         │
├──────────────────────┤
│ mmap 区域（共享库等）  │
├──────────────────────┤
│ 堆（向上增长）         │
├──────────────────────┤
│ .bss                  │
│ .data                 │
│ .rodata               │
│ .text                 │ 低地址（非 PIE 常见 0x400000）
└──────────────────────┘
低地址
```

- 非 PIE：代码段固定（如 `0x400000`）。
- PIE：整个可执行文件 `ET_DYN`，基址随机。
- ASLR 控制：`/proc/sys/kernel/randomize_va_space`（0 关，1 部分，2 全开）。
- 查看映射：`cat /proc/<pid>/maps`。

### 11.5 相关概念

| 概念 | 说明 |
|---|---|
| PIE | 位置无关可执行文件（`-pie -fPIE`） |
| `-no-pie` | 关闭 PIE，地址固定 |
| `vDSO` | 内核映射到用户空间的“快速系统调用”代码 |
| `vsyscall` | 旧式固定地址系统调用页 |
| `brk` / `sbrk` | 调整堆顶 |
| `mmap` | 映射文件/匿名内存 |
| 栈溢出保护 | canary + `PT_GNU_STACK` 不可执行 |

> 一句话：**装载 = 映射 `PT_LOAD` + 清零 `.bss` + 布置栈 + 跳到入口；PIE 只是把“固定地址”换成“随机基址 + 相对偏移”。**

---

## 12. 嵌入式专题：启动、链接脚本、中断

### 12.1 复位到 main 的流程

```text
上电/复位
  → 从向量表取初始 MSP
  → 从向量表取 Reset_Handler
  → 设置栈、时钟、看门狗
  → 拷贝 .data（Flash → RAM）
  → 清零 .bss
  → 调用 SystemInit / main
  → main 不返回；返回则进入 while(1)
```

**启动汇编（Cortex-M 风格）**

```asm
    .syntax unified
    .thumb

    .section .isr_vector, "a", %progbits
    .word _estack
    .word Reset_Handler
    .word NMI_Handler
    .word HardFault_Handler
    /* ... 其余异常与中断 ... */

    .text
    .thumb_func
Reset_Handler:
    ldr r0, =_sidata
    ldr r1, =_sdata
    ldr r2, =_edata
1:  cmp r1, r2
    bcs 2f
    ldr r3, [r0], #4
    str r3, [r1], #4
    b   1b
2:
    ldr r1, =_sbss
    ldr r2, =_ebss
    movs r3, #0
3:  cmp r1, r2
    bcs 4f
    str r3, [r1], #4
    b   3b
4:
    bl main
5:  b 5b
```

### 12.2 Cortex-M 向量表

| 偏移 | 内容 |
|---|---|
| `0x00` | 初始 MSP |
| `0x04` | Reset_Handler |
| `0x08` | NMI_Handler |
| `0x0C` | HardFault_Handler |
| `0x10` | MemManage_Handler |
| `0x14` | BusFault_Handler |
| `0x18` | UsageFault_Handler |
| `0x1C`–`0x28` | 保留 |
| `0x2C` | SVC_Handler |
| `0x30` | DebugMon_Handler |
| `0x34` | 保留 |
| `0x38` | PendSV_Handler |
| `0x3C` | SysTick_Handler |
| `0x40...` | 外部中断 IRQ0... |

**C 语言定义向量表**

```c
__attribute__((section(".isr_vector"), used))
const void *vectors[] = {
    (void *)0x20001000,      // 初始 MSP
    (void *)Reset_Handler,
    (void *)NMI_Handler,
    (void *)HardFault_Handler,
    /* ... */
};
```

### 12.3 中断现场

Cortex-M 硬件自动压栈 8 个字（低地址到高地址）：

| 顺序 | 寄存器 |
|---|---|
| 1 | `r0` |
| 2 | `r1` |
| 3 | `r2` |
| 4 | `r3` |
| 5 | `r12` |
| 6 | `lr` |
| 7 | `pc`（返回地址） |
| 8 | `xPSR` |

- 返回用 `BX lr`，`lr` 中是 `EXC_RETURN`：
  - `0xFFFFFFF1`：返回 Handler 模式，使用 MSP
  - `0xFFFFFFF9`：返回 Thread 模式，使用 MSP
  - `0xFFFFFFFD`：返回 Thread 模式，使用 PSP
- 浮点上下文（FPU 开启）会额外压栈 `S0`–`S15`、`FPSCR`。

### 12.4 临界区与屏障

```c
__disable_irq();          // CPSID i
/* 临界区 */
__enable_irq();           // CPSIE i

__DMB();                  // 数据内存屏障：保证访问顺序
__DSB();                  // 数据同步屏障：等待完成
__ISB();                  // 指令同步屏障：清流水线
```

**原子读-改-写**：`__LDREXW` / `__STREXW`、`__atomic_fetch_add`、关中断。

### 12.5 寄存器与位操作

```c
#define REG  (*(volatile uint32_t *)0x40021000)

REG |=  (1u << 3);        // 置位
REG &= ~(1u << 3);        // 清零
REG ^=  (1u << 3);        // 取反
if (REG & (1u << 3)) {}   // 读位
REG = (REG & ~(0x3u << 4)) | (val << 4);  // 改位段
```

⚠️ 读-改-写不是原子操作；中断或多核并发时要加临界区。

### 12.6 常用属性

```c
__attribute__((section(".mysec")))  int x;
__attribute__((aligned(16)))        char buf[64];
__attribute__((packed))             struct S { char c; int i; };
__attribute__((interrupt))          void Handler(void);
__attribute__((naked))              void Reset_Handler(void);
__attribute__((weak))               void Default_Handler(void) { while (1); }
```

### 12.7 内存与字节序

| 概念 | 要点 |
|---|---|
| 小端 | 低字节在低地址（x86/ARM 默认） |
| 大端 | 高字节在低地址（部分网络/旧架构） |
| 对齐 | 未对齐访问在部分 ARM 上会 fault 或变慢 |
| 位域 | 布局依赖编译器/ABI，跨平台不要直接序列化 |
| `volatile` | 只保证“每次访问”，不保证原子/顺序 |
| `const` | 放 `.rodata`；嵌入式常放 Flash |
| `static` | 文件内可见 / 静态存储期 |
| `extern` | 声明，不分配 |

### 12.8 Cortex-M 存储器映射

| 区域 | 地址 |
|---|---|
| Code | `0x0000_0000` |
| SRAM | `0x2000_0000` |
| 外设 | `0x4000_0000` |
| 外部 RAM | `0x6000_0000` |
| PPB（NVIC/SCB/SysTick） | `0xE000_0000` |

**位带（M3/M4）**：`0x2000_0000` → `0x2200_0000`，`0x4000_0000` → `0x4200_0000`；公式 `alias = base + offset*32 + bit*4`。

### 12.9 常用启动/链接符号

| 符号 | 含义 |
|---|---|
| `_estack` | 栈顶 |
| `_sidata` | `.data` 在 Flash 中的起始（加载地址） |
| `_sdata` / `_edata` | `.data` 在 RAM 中的起止 |
| `_sbss` / `_ebss` | `.bss` 起止 |
| `__heap_start` / `__heap_end` | 堆范围 |
| `Reset_Handler` | 复位入口 |
| `Default_Handler` | 默认中断处理 |

> 一句话：**启动代码就干三件事：设栈、搬 `.data`、清 `.bss`，然后 `bl main`。**

---

## 13. 内联汇编与编译器屏障

### 13.1 GCC 基本语法

```c
asm [volatile] (
    "汇编模板"
    : 输出操作数
    : 输入操作数
    : 破坏列表
);
```

### 13.2 约束（constraint）

| 约束 | 含义 |
|---|---|
| `r` | 通用寄存器 |
| `m` | 内存操作数 |
| `i` | 立即数 |
| `n` | 已知立即数 |
| `g` | 寄存器/内存/立即数皆可 |
| `X` | 任意操作数 |
| `0`–`9` | 与第 n 个操作数使用同一位置 |
| `=` | 只写 |
| `+` | 读写 |
| `&` | 早破坏（输出不能与输入共用寄存器） |
| `a` / `b` / `c` / `d` / `S` / `D` | 指定 x86 寄存器 |
| `x` | SSE 寄存器 |
| `f` | x87 寄存器 |

### 13.3 示例

```c
// 读时间戳计数器
static inline uint64_t rdtsc(void) {
    uint32_t lo, hi;
    asm volatile("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
}

// 原子加
static inline void atomic_add(int *p, int v) {
    asm volatile("lock; addl %1, %0"
                 : "+m"(*p)
                 : "r"(v)
                 : "cc", "memory");
}

// 读 ARM CPSR
static inline uint32_t read_cpsr(void) {
    uint32_t v;
    asm volatile("mrs %0, cpsr" : "=r"(v));
    return v;
}
```

### 13.4 编译器屏障

```c
asm volatile("" ::: "memory");   // 阻止编译器跨过此处重排内存访问
```

- `asm volatile` 只保证“不被删除、不被移到别处”，**不保证 CPU 不乱序**。
- CPU 级顺序需要 `mfence` / `lfence` / `sfence`，或 ARM 的 `DMB` / `DSB` / `ISB`。
- C11 原子：`atomic_thread_fence(memory_order_seq_cst)`。

### 13.5 常见错误

| 错误 | 后果 |
|---|---|
| 忘写 `volatile` | 优化把汇编删掉 |
| 忘写 `"memory"` | 编译器把内存访问挪到汇编前后 |
| 忘写 `"cc"` | 标志寄存器被破坏，条件跳转出错 |
| 输出没写 `+` | 输入值被覆盖，结果错误 |
| 早破坏没写 `&` | 输出与输入共用寄存器，互相踩 |
| 模板里写死寄存器 | 与编译器分配冲突 |

> 一句话：**内联汇编三件套：`volatile` 防删、`"memory"` 防挪、`"cc"` 防标志被踩。**

---

## 14. 工具链命令卡

### 14.1 编译 / 链接

```bash
gcc -E a.c -o a.i                 # 预处理
gcc -S a.c -o a.s                 # 生成汇编
gcc -S -masm=intel a.c            # Intel 语法
gcc -S -fverbose-asm a.c          # 带注释的汇编
gcc -c a.s -o a.o                 # 汇编
gcc a.o -o a                      # 链接
gcc -O2 -fno-asynchronous-unwind-tables -fno-stack-protector -S a.c
gcc -shared -fPIC a.c -o liba.so  # 共享库
gcc -static a.c -o a_static       # 静态链接
gcc -m32 a.c -o a32               # 32 位
```

### 14.2 查看 / 修改

```bash
file a.out
readelf -h -S -l -s -r -d a.out
objdump -d -M intel a.out
objdump -d -M intel -j .text a.out
objdump -s -j .data a.out
objdump -t a.out
nm -C a.out
nm -D liba.so
size a.out
strings -a a.out
c++filt _Z3fooi
ar rcs liba.a a.o b.o
objcopy -O binary a.out a.bin
objcopy -O ihex a.out a.hex
strip a.out
ldd a.out
ldconfig -p | grep liba
```

### 14.3 GDB

```gdb
set disassembly-flavor intel
disassemble /r main
disassemble /m main
x/16i $pc
x/8gx $rsp
info registers
info frame
bt
frame 1
b *0x4005a0
b main
run
si
ni
c
p $rax
p/x *(int *)($rbp-4)
```

### 14.4 其他

```bash
addr2line -e a.out -f -C 0x4005a0
strace ./a.out
ltrace ./a.out
perf stat ./a.out
patchelf --set-rpath '$ORIGIN/lib' a.out
patchelf --print-soname liba.so
```

> 一句话：**读 ELF 用 `readelf`，读指令用 `objdump -d -M intel`，读符号用 `nm -C`，读运行时用 `gdb` + `/proc/<pid>/maps`。**

---

## 15. x86-64 指令编码入门

### 15.1 指令格式

```text
[legacy prefixes] [REX] [opcode] [ModRM] [SIB] [disp] [imm]
```

| 部分 | 作用 |
|---|---|
| legacy prefix | `66` 操作数大小、`67` 地址大小、`F2/F3` 重复、`F0` lock、段前缀 |
| REX | `0100 WRXB`：W=64 位，R/X/B 扩展寄存器号 |
| opcode | 1–3 字节 |
| ModRM | `mod(2) reg(3) r/m(3)` |
| SIB | `scale(2) index(3) base(3)` |
| disp | 0/8/32 位位移 |
| imm | 0/8/16/32/64 位立即数 |

**REX 位**

| 位 | 名称 | 作用 |
|---|---|---|
| 7–4 | `0100` | 固定 |
| 3 | W | 1 = 64 位操作数 |
| 2 | R | 扩展 ModRM.reg |
| 1 | X | 扩展 SIB.index |
| 0 | B | 扩展 ModRM.r/m 或 opcode 寄存器 |

**ModRM 的 mod**

| mod | 含义 |
|---|---|
| `00` | 寄存器间接（r/m=101 时为 RIP 相对 disp32） |
| `01` | 基址 + disp8 |
| `10` | 基址 + disp32 |
| `11` | 寄存器直接 |

**SIB 的 scale**：`0→1`、`1→2`、`2→4`、`3→8`。

### 15.2 常见编码对照

| 指令 | 机器码 |
|---|---|
| `push %rbp` | `55` |
| `pop %rbp` | `5d` |
| `mov %rbp, %rsp` | `48 89 e5` |
| `sub $0x10, %rsp` | `48 83 ec 10` |
| `leave` | `c9` |
| `ret` | `c3` |
| `nop` | `90` |
| `syscall` | `0f 05` |
| `int3` | `cc` |
| `ud2` | `0f 0b` |
| `endbr64` | `f3 0f 1e fa` |
| `mov $1, %eax` | `b8 01 00 00 00` |
| `mov $1, %edi` | `bf 01 00 00 00` |
| `mov -8(%rbp), %rax` | `48 8b 45 f8` |
| `mov %rax, -8(%rbp)` | `48 89 45 f8` |
| `mov -8(%rbp), %eax` | `8b 45 f8` |
| `mov %eax, -4(%rbp)` | `89 45 fc` |
| `lea 8(%rax), %rcx` | `48 8d 48 08` |
| `jmp rel8` | `eb xx` |
| `je rel8` | `74 xx` |
| `jne rel8` | `75 xx` |
| `jmp rel32` | `e9 xx xx xx xx` |
| `call rel32` | `e8 xx xx xx xx` |
| `jmp *disp32(%rip)` | `ff 25 xx xx xx xx` |

### 15.3 手工解码示例

`48 8b 45 f8`：

- `48`：REX.W，64 位操作。
- `8b`：`mov r64, r/m64`。
- `45`：ModRM = `01 000 101`，mod=01（disp8），reg=000（`rax`），r/m=101（`rbp`）。
- `f8`：disp8 = -8。

结果：`mov -8(%rbp), %rax`。

`48 8d 05 10 00 00 00`：

- `48`：REX.W。
- `8d`：`lea`。
- `05`：ModRM = `00 000 101`，mod=00，r/m=101 → RIP 相对 disp32。
- `10 00 00 00`：disp32 = 0x10。

结果：`lea 0x10(%rip), %rax`。

> 一句话：**先看 REX 的 W，再看 opcode，最后拆 ModRM 的 mod/reg/r-m；`r/m=100` 要再读 SIB，`r/m=101 + mod=00` 是 RIP 相对。**

---

## 16. 易错点清单

1. ⚠️ AT&T 是 `源, 目的`，别按 Intel 顺序读。
2. ⚠️ `mov %eax, ...` 会把 `rax` 高 32 位清零；`mov %ax, ...` 不会。
3. ⚠️ `movsx` / `movzx` 分清：有符号扩展 vs 零扩展。
4. ⚠️ 有符号比较用 `jg/jl`，无符号用 `ja/jb`，混用会得到相反结果。
5. ⚠️ `idiv` 前要 `cqo`（或 `cdq`），否则 `rdx` 里的垃圾会让除法溢出。
6. ⚠️ `div` 是 `rdx:rax / 操作数`，不是 `rax / 操作数`。
7. ⚠️ `call` 前栈必须 16 字节对齐，否则 `movaps` 可能崩。
8. ⚠️ 红区只有 128 字节，且信号处理可能破坏它；非叶子函数别乱用。
9. ⚠️ 调用者保存的寄存器跨 `call` 后不可假设不变。
10. ⚠️ 可变参数函数要设置 `al`（向量寄存器个数）。
11. ⚠️ 结构体有填充，`sizeof` 不等于成员大小之和。
12. ⚠️ 数组名退化为指针，`sizeof(arr)` 在函数参数里是指针大小。
13. ⚠️ `volatile` 不保证原子性，也不保证多核顺序。
14. ⚠️ 内联汇编忘写 `"memory"`，编译器可能把访存挪位置。
15. ⚠️ PIC 代码里不能直接写外部符号的绝对地址。
16. ⚠️ 静态库顺序敏感，循环依赖要 `--start-group`。
17. ⚠️ 共享库缺 `SONAME` 会导致升级后找不到。
18. ⚠️ `-fPIC` 编译的库才能被共享库安全链接。
19. ⚠️ `-no-pie` 与 PIE 的地址假设不同，混用会链接错误。
20. ⚠️ 全局变量在共享库中可能触发 copy relocation，可用 `-fPIC` 全量编译避免。
21. ⚠️ 函数指针调用可能走 PLT，性能敏感可 `-fno-plt`。
22. ⚠️ 未定义行为（越界、悬垂指针、严格别名）在 `-O2` 下会被“优化”成意外结果。
23. ⚠️ 大小端、位域布局、`#pragma pack` 跨平台不可假定。
24. ⚠️ `volatile` 指针不等于 `volatile` 数据；`volatile int *p` 与 `int *volatile p` 不同。
25. ⚠️ 链接脚本里 `.data` 的 VMA 在 RAM、LMA 在 Flash，启动代码必须搬。

---

## 17. 速记口诀

**寄存器**

- x86-64 参数：**“di si dx cx，r8 r9”**（第 1–6 个）。
- 被调用者保存：**“bx bp，12 13 14 15”**。
- 返回值：**“函数看 rax，浮点看 xmm0，128 位看 rdx:rax”**。

**跳转**

- **“g/l 管有符号，a/b 管无符号”**。
- **“jg 看 SF=OF，ja 看 CF=0”**。

**栈帧**

- **“存 rbp、立 rbp、减 rsp”** 是序言；**“leave、ret”** 是尾声。
- **“rbp+8 返回地址，rbp+16 第七参数，rbp-8 第一个局部变量”**。

**链接**

- **“符号解析找定义，重定位填地址”**。
- **“静态库按需拉，顺序不能差”**。

**动态链接**

- **“GOT 存地址，PLT 做跳板；一次解析，之后直跳”**。
- **“GOT[0] dynamic，GOT[1] link_map，GOT[2] resolver”**。

**ELF**

- **“text 代码，data 初值，bss 零，rodata 只读，symtab 符号，rela 重定位”**。
- **“节给链接器看，段给装载器看”**。

**嵌入式**

- **“设栈、搬 data、清 bss、进 main”**。
- **“向量表头两个字：栈顶、复位”**。

---

## 18. 自测 20 题

<details>
<summary>1. x86-64 下第 4 个整数参数放在哪个寄存器？</summary>

`rcx`。前六个依次是 `rdi, rsi, rdx, rcx, r8, r9`。
</details>

<details>
<summary>2. 函数入口时 `rsp % 16` 等于多少？</summary>

8。因为 `call` 压入了 8 字节返回地址；调用前 `rsp % 16 == 0`。
</details>

<details>
<summary>3. `mov %eax, %ebx` 对 `rbx` 的高 32 位有什么影响？</summary>

清零。任何写 32 位寄存器的操作都会把对应 64 位寄存器的高 32 位清零。
</details>

<details>
<summary>4. `cmp %esi, %edi` 计算的是什么？</summary>

`edi - esi`。AT&T 是“源, 目的”，`cmp` 做“目的 - 源”。
</details>

<details>
<summary>5. 有符号“大于等于”用哪条跳转指令？</summary>

`jge`（`SF == OF`）。
</details>

<details>
<summary>6. 无符号“低于”用哪条跳转指令？</summary>

`jb`（`CF == 1`），也叫 `jc` / `jnae`。
</details>

<details>
<summary>7. `idiv` 之前为什么要 `cqo`？</summary>

`idiv` 用 `rdx:rax` 作被除数；`cqo` 把 `rax` 的符号扩展到 `rdx`，避免高位垃圾导致商溢出。
</details>

<details>
<summary>8. `leave` 等价于哪两条指令？</summary>

`mov %rbp, %rsp` 然后 `pop %rbp`。
</details>

<details>
<summary>9. `lea` 会访问内存吗？</summary>

不会。它只计算有效地址，不读也不写内存，也不改标志。
</details>

<details>
<summary>10. 红区有多大？谁能用？</summary>

128 字节，位于 `rsp` 以下；叶子函数可以直接用，非叶子函数调用后可能被覆盖。
</details>

<details>
<summary>11. 哪些寄存器由被调用者负责保存（SysV）？</summary>

`rbx, rbp, r12, r13, r14, r15, rsp`。
</details>

<details>
<summary>12. `.bss` 占文件空间吗？</summary>

不占。它是 `SHT_NOBITS`，装载时由内核清零；`p_memsz > p_filesz` 的部分就是它。
</details>

<details>
<summary>13. 静态链接器做的两件事是什么？</summary>

符号解析和重定位。
</details>

<details>
<summary>14. 静态库为什么顺序敏感？</summary>

链接器从左到右扫描，只提取“能解决当前未定义符号”的成员；后面的库无法回头解决前面库留下的未定义符号。
</details>

<details>
<summary>15. GOT 和 PLT 分别是什么？</summary>

GOT 是数据段中存放外部符号地址的表；PLT 是代码段中的跳板，每个外部函数一个入口。
</details>

<details>
<summary>16. 惰性绑定第一次调用发生了什么？</summary>

PLT 跳到 GOT，GOT 初始指向 `push` 指令；压入重定位索引后跳到 `PLT0`，由 `_dl_runtime_resolve` 解析，把真实地址写回 GOT。
</details>

<details>
<summary>17. `PT_LOAD` 段中 `p_memsz > p_filesz` 的部分是什么？</summary>

`.bss` 等零初始化区域，装载时补零。
</details>

<details>
<summary>18. PIE 可执行文件的 `e_type` 是什么？</summary>

`ET_DYN`。它和共享库一样是位置无关的，只是有自己的入口。
</details>

<details>
<summary>19. Cortex-M 复位后硬件从哪里取初始栈指针？</summary>

复位时从地址 0x0000_0000 取第一个字（VTOR 复位值为 0）；运行中可通过 VTOR 重定位向量表。
</details>

<details>
<summary>20. 内联汇编的 `"memory"` 破坏项有什么用？</summary>

告诉编译器这段汇编可能读写任意内存，阻止它把内存访问跨过汇编重排，也阻止缓存值。
</details>

---

## 附：一页纸复习卡

```text
编译：.c -E→ .i -S→ .s -c→ .o --ld→ a.out
链接：符号解析 + 重定位
ELF ：text/data/bss/rodata/symtab/rela
动态：PIC → GOT/PLT → ld.so
装载：PT_LOAD 映射 + bss 清零 + 栈布局 + 入口
ABI ：rdi rsi rdx rcx r8 r9 / rax 返回 / 栈 16 对齐
栈帧：push rbp; mov rsp,rbp; sub rsp,N ... leave; ret
嵌入：设栈 → 搬 data → 清 bss → main
```

> 学习建议：每读一章，回到本手册对应小节，用 `objdump` / `readelf` 对着一个真实程序验证一遍；能讲清楚“这条指令为什么在这里”，比背指令表更有效。
