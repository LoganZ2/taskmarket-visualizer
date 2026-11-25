FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY scripts ./scripts
COPY docs ./docs
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
