# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install

# Copy source files
COPY . .

# Build arguments for API keys (passed at build time)
ARG VITE_OPENAI_API_KEY
ARG VITE_GROK_API_KEY
ARG VITE_GEMINI_API_KEY
ARG VITE_ASSEMBLYAI_API_KEY
ARG VITE_LLAMA_CLOUD_API_KEY
ARG VITE_EMBEDDING_MODEL
ARG VITE_MONGODB_DATA_API_URL
ARG VITE_MONGODB_DATA_API_KEY
ARG VITE_MONGODB_DATA_SOURCE
ARG VITE_MONGODB_VECTOR_DB
ARG VITE_MONGODB_VECTOR_COLLECTION
ARG VITE_MONGODB_VECTOR_INDEX
ARG VITE_MONGODB_VECTOR_PATH

# Set environment variables for build
ENV VITE_OPENAI_API_KEY=$VITE_OPENAI_API_KEY
ENV VITE_GROK_API_KEY=$VITE_GROK_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_ASSEMBLYAI_API_KEY=$VITE_ASSEMBLYAI_API_KEY
ENV VITE_LLAMA_CLOUD_API_KEY=$VITE_LLAMA_CLOUD_API_KEY
ENV VITE_EMBEDDING_MODEL=$VITE_EMBEDDING_MODEL
ENV VITE_MONGODB_DATA_API_URL=$VITE_MONGODB_DATA_API_URL
ENV VITE_MONGODB_DATA_API_KEY=$VITE_MONGODB_DATA_API_KEY
ENV VITE_MONGODB_DATA_SOURCE=$VITE_MONGODB_DATA_SOURCE
ENV VITE_MONGODB_VECTOR_DB=$VITE_MONGODB_VECTOR_DB
ENV VITE_MONGODB_VECTOR_COLLECTION=$VITE_MONGODB_VECTOR_COLLECTION
ENV VITE_MONGODB_VECTOR_INDEX=$VITE_MONGODB_VECTOR_INDEX
ENV VITE_MONGODB_VECTOR_PATH=$VITE_MONGODB_VECTOR_PATH

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install

# Copy source files
COPY . .

# Expose the development port
EXPOSE 3000

# Start the development server
CMD ["npm", "run", "dev"]
