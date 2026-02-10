import dotenv from 'dotenv';

dotenv.config();

export interface ServiceRoute {
  path: string;
  target: string;
  requireAuth: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  rewritePath?: string;
}

export const config = {
  // Service info
  serviceName: process.env.OTEL_SERVICE_NAME || 'api-gateway',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  
  // Server
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '8080', 10),
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  
  // Rate limiting defaults
  defaultRateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  
  // Service routes
  services: {
    userService: process.env.USER_SERVICE_URL || 'http://user-service:8001',
    orderService: process.env.ORDER_SERVICE_URL || 'http://order-service:8002',
    paymentService: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8003',
    inventoryService: process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8004',
    notificationService: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8005',
    shippingService: process.env.SHIPPING_SERVICE_URL || 'http://shipping-service:8006',
    recommendationService: process.env.RECOMMENDATION_SERVICE_URL || 'http://recommendation-service:8007',
    analyticsService: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8008',
    auditService: process.env.AUDIT_SERVICE_URL || 'http://audit-service:8009',
    productService: process.env.PRODUCT_SERVICE_URL || 'http://product-service:8010',
    catalogService: process.env.CATALOG_SERVICE_URL || 'http://catalog-service:8022',
    cartService: process.env.CART_SERVICE_URL || 'http://cart-service:8011',
    searchService: process.env.SEARCH_SERVICE_URL || 'http://search-service:8012',
    reviewsService: process.env.REVIEWS_SERVICE_URL || 'http://reviews-service:8013',
    reportingService: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:8014',
  },
  
  // OpenTelemetry
  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    serviceName: process.env.OTEL_SERVICE_NAME || 'api-gateway',
  },
};

// Route configuration
export const routes: ServiceRoute[] = [
  // User service routes
  { path: '/api/users', target: config.services.userService, requireAuth: false },
  { path: '/api/auth', target: config.services.userService, requireAuth: false },
  
  // Order service routes
  { path: '/api/orders', target: config.services.orderService, requireAuth: true },
  
  // Payment service routes
  { path: '/api/payments', target: config.services.paymentService, requireAuth: true },
  
  // Inventory service routes
  { path: '/api/inventory', target: config.services.inventoryService, requireAuth: false },
  { path: '/api/products', target: config.services.productService, requireAuth: false },

  // Catalog service routes (v1 API)
  { path: '/api/v1/products', target: config.services.catalogService, requireAuth: false },
  { path: '/api/v1/categories', target: config.services.catalogService, requireAuth: false },

  // Catalog service routes (legacy API - maps to v1)
  { path: '/api/categories', target: config.services.catalogService, requireAuth: false, rewritePath: '/api/v1/categories' },
  
  // Cart service routes
  { path: '/api/cart', target: config.services.cartService, requireAuth: true },
  
  // Search service routes
  { path: '/api/search', target: config.services.searchService, requireAuth: false },
  
  // Reviews service routes
  { path: '/api/reviews', target: config.services.reviewsService, requireAuth: false },
  
  // Recommendation service routes
  { path: '/api/recommendations', target: config.services.recommendationService, requireAuth: false },
  
  // Shipping service routes
  { path: '/api/shipping', target: config.services.shippingService, requireAuth: true },
  
  // Notification service routes
  { path: '/api/notifications', target: config.services.notificationService, requireAuth: true },
  
  // Analytics service routes (admin only)
  { path: '/api/analytics', target: config.services.analyticsService, requireAuth: true },
  
  // Audit service routes (admin only)
  { path: '/api/audit', target: config.services.auditService, requireAuth: true },
  
  // Reporting service routes
  { path: '/api/reports', target: config.services.reportingService, requireAuth: true },
];

export default config;

