FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o runmate .

FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Seoul
WORKDIR /app
COPY --from=builder /app/runmate .
COPY templates/ templates/
EXPOSE 8080
CMD ["./runmate"]
