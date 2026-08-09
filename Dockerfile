# Build from the common parent directory so Docker can access the local picoflow
# debug package:
# docker build -f picoflow-demo/Dockerfile -t picoflow-demo:local .
FROM node:22-alpine AS build

WORKDIR /workspace/picoflow-ws/picoflow
COPY picoflow-ws/picoflow/package.json ./
COPY picoflow-ws/picoflow/tsconfig.json ./
COPY picoflow-ws/picoflow/src ./src
COPY picoflow-ws/picoflow/npmlib ./npmlib
COPY picoflow-ws/picoflow/scripts ./scripts
RUN npm install && npm run build:locallib

WORKDIR /workspace/picoflow-demo
COPY picoflow-demo/package*.json ./
RUN npm install
COPY picoflow-demo/tsconfig.json ./
COPY picoflow-demo/tsconfig.build.json ./
COPY picoflow-demo/tsconfig.contract.json ./
COPY picoflow-demo/nest-cli.json ./
COPY picoflow-demo/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /workspace/picoflow-demo
COPY --from=build /workspace /workspace

EXPOSE 8000
CMD ["npm", "run", "start:prod"]
