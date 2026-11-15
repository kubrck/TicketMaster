package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"event-ticketing-system/internal/config"
	"event-ticketing-system/internal/database"
	"event-ticketing-system/internal/kafka"
	"event-ticketing-system/internal/queue"
	appredis "event-ticketing-system/internal/redis"
	"event-ticketing-system/internal/repository"
	"event-ticketing-system/internal/routes"
	"event-ticketing-system/internal/services"
	"event-ticketing-system/internal/websocket"

	_ "github.com/lib/pq"
)

func main() {
	log.SetOutput(os.Stdout)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := database.Connect(cfg); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// README contract: migrate on start when asked, or by default on Railway unless explicitly disabled.
	runMigrations := os.Getenv("RUN_MIGRATIONS_ON_START")
	if runMigrations == "true" || (runMigrations != "false" && os.Getenv("RAILWAY_ENVIRONMENT") != "") {
		if err := database.RunMigrations(); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
	}

	redisClient, err := appredis.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer appredis.Close()
	database.InitSeatReadRouting(redisClient)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	hub := websocket.NewHubWithConfig(cfg)
	hub.SetRedis(redisClient)
	hub.SetContext(ctx)
	go hub.Run()
	go hub.StartFanout(ctx)

	if len(cfg.Kafka.Brokers) > 0 {
		if err := kafka.EnsureTopics(ctx, cfg); err != nil {
			log.Printf("Warning: ensure Kafka topics: %v", err)
		}
	}

	// Background workers get their own service instances; services are stateless over the shared DB/Redis.
	eventRepo := repository.NewEventRepository()
	venueRepo := repository.NewVenueRepository()
	seatRepo := repository.NewSeatRepository()
	expiryQueue := queue.NewExpiryQueue(redisClient)
	eventService := services.NewEventService(eventRepo, venueRepo, seatRepo, redisClient, cfg)
	bookingService := services.NewBookingService(
		repository.NewBookingRepository(), eventRepo, seatRepo, cfg, expiryQueue, services.NewPaymentService(cfg),
	)
	bookingService.SetCacheInvalidator(eventService.InvalidateEventCache)

	go services.RunExpiredReservationCleanup(ctx, bookingService)
	if releaseWorker, err := services.NewBatchReleaseWorker(bookingService, expiryQueue, cfg); err != nil {
		log.Printf("Warning: batch release worker disabled: %v", err)
	} else {
		go releaseWorker.Run(ctx)
	}

	if q := queue.NewQueue(cfg, redisClient); q.Enabled() {
		q.SetMaxRetries(cfg.Queue.MaxRetries)
		defer q.Close()
		if producer, err := kafka.NewProducer(cfg); err == nil && producer.Enabled() {
			bookingService.SetEventPublisher(services.NewKafkaEventPublisher(producer))
			defer producer.Close()
		}
		go services.NewBookingWorker(bookingService, seatRepo, q, hub, cfg).StartBookingWorker(ctx)
		go services.NewPurchaseWorker(bookingService, q, hub).StartPurchaseWorker(ctx)
		go services.NewQueueMonitor(q, cfg, "booking-workers", "purchase-workers").Run(ctx)

		consumer := kafka.NewBookingEventConsumer(cfg, "booking-event-consumers")
		defer consumer.Close()
		go services.NewBookingEventConsumer(consumer, eventService.InvalidateEventCache, hub).Run(ctx)
	} else {
		bookingService.SetEventPublisher(services.NewHubEventPublisher(hub)) // expiry releases update live seat maps
		log.Println("Kafka command queue not configured; bookings are processed synchronously")
	}

	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      routes.SetupRoutes(cfg, redisClient, hub),
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeoutSec) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeoutSec) * time.Second,
		IdleTimeout:  time.Duration(cfg.Server.IdleTimeoutSec) * time.Second,
	}

	go func() {
		log.Printf("Server starting on :%s", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.Server.ShutdownTimeoutSec)*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Graceful shutdown failed: %v", err)
	}
}
