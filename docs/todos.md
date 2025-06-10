# Testing Setup Tasks

## Current Tasks

- [x] Install Jest + Supertest dependencies
- [x] Create basic Jest configuration
- [x] Setup test database configuration
- [x] Create test utilities and helpers
- [x] Write example tests for controllers (excluding withdrawal and deposit)
- [x] Configure test coverage
- [x] Add test scripts to package.json
- [ ] Run initial tests and fix any issues

## Testable Controllers (Priority)

- [x] Authentication (login, register, logout)
- [x] Profile management (getProfile, updateProfile)
- [x] Cases (getCases, openCase, getCasesAvailable)
- [x] Inventory (getInventory, sellItem)
- [x] Subscription (buySubscription, getSubscription)
- [x] Achievements and missions
- [x] Statistics and leaderboard
- [x] Promo codes

## Controllers to Skip Initially

- [ ] withdrawItem (Steam integration not ready)
- [ ] deposit (external payment gateway)
- [ ] withdrawBalance (external payment gateway)

## Notes

- Use test database: chibox-game-test
- Mock external services (Steam, YooKassa)
- Focus on business logic testing
- Setup integration tests for API endpoints
