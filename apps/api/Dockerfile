FROM node:22-slim

WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "--filter", "@ojaline/api", "dev"]
