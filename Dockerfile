FROM node:15.6

WORKDIR /opt/helium-taxable

ADD package.json package.json
ADD package-lock.json package-lock.json

RUN npm install
ADD index.js index.js

RUN mkdir reports

CMD ["npm", "start"]
