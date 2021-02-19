FROM node:15.6

WORKDIR /opt/helium-taxable

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN mkdir reports
RUN mkdir data

RUN npm install
COPY index.js index.js

CMD ["npm", "start"]
