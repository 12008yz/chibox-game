# ChiBox API Endpoints Setup

## API Structure Overview

- Base URL: `/api/v1/`
- Auth URL: `/api/v1/auth/`
- Payment URL: `/api/payment/`

## Current Status Analysis

### ✅ Working Endpoints (from userRoutes.js)

**Test Endpoints:**

- `GET /api/v1/test` ✅ (working)
- `POST /api/v1/test-post` ✅ (working)

### 🔧 To Be Configured/Tested

#### Authentication Endpoints

- `POST /api/v1/register` - User registration
- `POST /api/v1/login` - User login
- `POST /api/v1/logout` - User logout
- `GET /api/v1/auth/steam` - Steam OAuth
- `GET /api/v1/auth/status` - Auth status check

#### User Profile Endpoints

- `GET /api/v1/profile` - Get user profile
- `PUT /api/v1/profile` - Update user profile
- `GET /api/v1/users/:id` - Get public profile

#### Game/Case Endpoints

- `GET /api/v1/cases` - Get available cases
- `GET /api/v1/cases/available` - Get cases user can open
- `POST /api/v1/cases/buy` - Buy case
- `GET /api/v1/cases/purchase-info` - Get case purchase info
- `POST /api/v1/open-case` - Open case

#### Inventory & Items

- `GET /api/v1/inventory` - Get user inventory
- `POST /api/v1/sell-item` - Sell item
- `POST /api/v1/withdraw-item` - Withdraw item
- `GET /api/v1/withdraw-item/:withdrawalId` - Get withdrawal status

#### Financial Endpoints

- `GET /api/v1/balance` - Get user balance
- `POST /api/v1/deposit` - Deposit money
- `POST /api/v1/withdraw-balance` - Withdraw balance
- `GET /api/v1/transactions` - Get transaction history
- `POST /api/v1/promo` - Apply promo code

#### Subscription Endpoints

- `POST /api/v1/subscription/buy` - Buy subscription
- `GET /api/v1/subscription` - Get subscription info
- `POST /api/v1/items/exchange-for-subscription` - Exchange item for subscription

#### Game Features

- `GET /api/v1/achievements` - Get achievements
- `GET /api/v1/achievements/progress` - Get achievement progress
- `GET /api/v1/missions` - Get missions
- `GET /api/v1/statistics` - Get user statistics
- `GET /api/v1/leaderboard` - Get leaderboard
- `GET /api/v1/notifications` - Get notifications

#### Bonus System

- `POST /api/v1/bonus/play-squares` - Play bonus mini-game
- `GET /api/v1/bonus/status` - Get bonus status
- `GET /api/v1/bonus-info` - Get bonus information

#### Steam Bot Integration

- `POST /api/v1/steambot/login` - Login to Steam bot
- `POST /api/v1/steambot/send-trade` - Send Steam trade
- `GET /api/v1/steambot/inventory` - Get Steam inventory

#### Admin Endpoints

- `PUT /api/v1/admin/users/:id` - Admin update user

#### Payment Webhooks

- `POST /api/payment/webhook` - YooMoney webhook

## Next Actions

1. ✅ CORS configuration fixed
2. 🔄 Test all endpoints systematically
3. 🔄 Check authentication middleware
4. 🔄 Verify database connections
5. 🔄 Test frontend integration
6. 🔄 Document API responses
7. 🔄 Add error handling improvements
