# Base Image
FROM node:18-alpine

# Zeitdaten und Zeitzone installieren und festlegen
RUN apk update && apk add --no-cache tzdata 

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN mkdir /app/logs
RUN mkdir /app/printers
RUN npm install

# Copy application code
COPY . .

# Expose port 4000 for the backend
EXPOSE 4000

# Start the backend
CMD ["node", "backend.js"]
