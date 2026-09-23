FROM node:lts-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install -g pm2
RUN npm ci --only=production

COPY . .

RUN chmod +x start.sh

CMD ["./start.sh"]
