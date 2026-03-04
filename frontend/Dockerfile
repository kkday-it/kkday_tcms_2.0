# Stage 1: Build the React app
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
# 預設 /api/v1；EC2 掛在 /tcms 下時：
#   docker compose build --build-arg VITE_API_URL=/tcms/api/v1 --build-arg VITE_BASE_URL=/tcms/ frontend
ARG VITE_API_URL=/api/v1
ARG VITE_BASE_URL=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_URL=$VITE_BASE_URL
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Replace default Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
