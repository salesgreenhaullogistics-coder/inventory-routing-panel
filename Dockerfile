FROM node:18-slim

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Install root dependencies
RUN npm install

# Copy server
COPY server ./server
RUN cd server && npm install

# Copy client and build
COPY client ./client
RUN cd client && npm install && npx vite build

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server/index.js"]
