# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM alpine:3.19

# Install nginx
RUN apk add --no-cache nginx

# Create nginx user and necessary directories
RUN mkdir -p /var/log/nginx /var/lib/nginx/tmp /usr/share/nginx/html && \
    chown -R nginx:nginx /var/log/nginx /var/lib/nginx /usr/share/nginx/html

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configurations
COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/http.d/default.conf

# Expose only port 42069
EXPOSE 42069

# Start nginx as foreground process
CMD ["nginx", "-g", "daemon off;"]
