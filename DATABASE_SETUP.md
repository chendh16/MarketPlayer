# MarketPlayer 数据库安装指南

## 📋 系统信息

- **操作系统**: macOS 15.5
- **Node.js**: 已安装 ✅
- **npm**: 已安装 ✅
- **Homebrew**: 未安装 ❌

---

## 🚀 安装步骤

### 步骤 1: 安装 Homebrew（必需）

Homebrew 是 macOS 的包管理器，用于安装 PostgreSQL 和 Redis。

**打开终端，运行以下命令：**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**安装过程中：**
- 会提示输入你的 Mac 密码
- 需要等待 5-10 分钟
- 安装完成后，按照提示将 Homebrew 添加到 PATH

**验证安装：**
```bash
brew --version
```

---

### 步骤 2: 运行自动安装脚本

安装完 Homebrew 后，在项目目录运行：

```bash
chmod +x install-db.sh
./install-db.sh
```

这个脚本会自动：
- ✅ 安装 PostgreSQL 15
- ✅ 安装 Redis 7
- ✅ 启动数据库服务
- ✅ 创建数据库和用户
- ✅ 验证安装

---

### 步骤 3: 运行数据库迁移

```bash
npm run migrate
```

---

### 步骤 4: 启动开发服务器

```bash
npm run dev
```

---

## 🔧 手动安装（如果自动脚本失败）

### 安装 PostgreSQL

```bash
# 安装
brew install postgresql@15

# 启动服务
brew services start postgresql@15

# 创建数据库
createdb trading_bot

# 创建用户
psql trading_bot -c "CREATE USER trading_user WITH PASSWORD 'password';"
psql trading_bot -c "GRANT ALL PRIVILEGES ON DATABASE trading_bot TO trading_user;"
```

### 安装 Redis

```bash
# 安装
brew install redis

# 启动服务
brew services start redis

# 测试连接
redis-cli ping
```

---

## ✅ 验证安装

### 检查服务状态

```bash
# 查看所有服务
brew services list

# 应该看到：
# postgresql@15  started
# redis          started
```

### 测试数据库连接

```bash
# 测试 PostgreSQL
psql -U trading_user -d trading_bot -c "SELECT version();"

# 测试 Redis
redis-cli ping
# 应该返回: PONG
```

---

## 🐛 常见问题

### 问题 1: Homebrew 安装失败

**解决方案：**
- 检查网络连接
- 使用国内镜像：
  ```bash
  export HOMEBREW_BREW_GIT_REMOTE="https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```

### 问题 2: PostgreSQL 启动失败

**解决方案：**
```bash
# 查看日志
brew services info postgresql@15

# 重启服务
brew services restart postgresql@15
```

### 问题 3: Redis 连接失败

**解决方案：**
```bash
# 检查 Redis 是否运行
ps aux | grep redis

# 重启 Redis
brew services restart redis
```

### 问题 4: 端口被占用

**解决方案：**
```bash
# 查看端口占用
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# 如果被占用，可以修改 .env 中的端口配置
```

---

## 📝 下一步

安装完成后：

1. ✅ 运行迁移：`npm run migrate`
2. ✅ 启动服务：`npm run dev`
3. ✅ 配置 API Keys（Discord、Anthropic）
4. ✅ 开始开发业务逻辑

---

## 💡 提示

- 数据库服务会在系统启动时自动运行
- 如需停止服务：`brew services stop postgresql@15`
- 如需停止 Redis：`brew services stop redis`
- 查看日志：`tail -f logs/combined.log`

---

**需要帮助？查看 INSTALLATION.md 获取更多信息**

