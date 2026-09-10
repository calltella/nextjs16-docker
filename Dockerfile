FROM node:22-bookworm

# Debian/Ubuntuベースのイメージなので apt-get を使用
RUN apt-get update && \
    apt-get install -y git curl sudo && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Debian/Ubuntuではsudoグループが標準で存在
RUN usermod -aG sudo node \
    && echo "%sudo ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/nopasswd \
    && chmod 0440 /etc/sudoers.d/nopasswd

# 開発用Dockerコンテナなので割り切って書き込み可にする
RUN mkdir -p /app && chown node:node /app && chmod 777 /app

WORKDIR /app

# household-account-book の内容を /app にコピー
COPY --chown=node:node . .

USER node

# コンテナ作成（手動作成）
# docker build -t household-account-book .
# docker run -it --rm --network supabase-net --name household-account-book household-account-book
# docker run -d --name household-account-book -v memoFolder:/.memoFolder --network supabase-net household-account-book tail -f /dev/null
# docker run -d -v memoFolder:/.memoFolder -v node_modules_household:/app/node_modules -v next_cache_household:/app/.next --name household-account-book --network supabase-net household-account-book tail -f /dev/null
