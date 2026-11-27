# From the directory containing both the pico-demo and picoflow checkouts:
# docker build -f pico-demo/Dockerfile -t pico-demo:local .
FROM node:24-alpine AS build

RUN apk add --no-cache python3 make g++
ENV npm_package_config_node_gyp_nodedir=/usr/local

WORKDIR /workspace/picoflow
COPY picoflow/package.json picoflow/yarn.lock picoflow/.yarnrc ./
RUN yarn install --frozen-lockfile --non-interactive
COPY picoflow/README.md picoflow/tsconfig.json ./
COPY picoflow/docs/supported-models.md ./docs/
COPY picoflow/src ./src
COPY picoflow/npmlib/package.json ./npmlib/
COPY picoflow/npmlib/src ./npmlib/src
COPY picoflow/scripts ./scripts
RUN npm run build:locallib

WORKDIR /workspace/pico-demo
COPY pico-demo/package.json pico-demo/yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive
COPY pico-demo/tsconfig*.json pico-demo/nest-cli.json ./
COPY pico-demo/src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /workspace/pico-demo
COPY --from=build /workspace /workspace

EXPOSE 8000
CMD ["npm", "run", "start:prod"]
