# docker build  -t rag-1:latest .
# docker build --progress=plain -t rag-1:latest .
# docker run -d -p 3000:3000 rag-1:latest
# docker run -it -p 3000:3000 rag-1:latest

FROM node:20.18.0-alpine3.20 AS build
WORKDIR /app
COPY package*.json ./

RUN yarn add glob rimraf
RUN yarn install

COPY . .

RUN yarn build

FROM node:20.18.0-alpine3.20 as publish
WORKDIR /app

RUN apk add --no-cache git

COPY package*.json ./

COPY --from=build /app /app

EXPOSE 8000
CMD ["yarn", "start"]