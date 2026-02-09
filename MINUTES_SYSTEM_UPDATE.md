# Minutes System Update

## Changes Made

### 1. Minutes Never Expire
- **Annual Plans**: No reset date is set (`minutesResetDate: null`)
- **Monthly Plans**: Reset date is set but minutes are ADDED, not replaced
- Old unused minutes are preserved and carried forward

### 2. Additive Minutes Allocation
When a user purchases a plan or gets a monthly reset:
- **Old behavior**: Replace all minutes with new allocation
- **New behavior**: Add new minutes to existing remaining minutes

Example:
- User has 10 minutes remaining
- Purchases Starter Monthly (200 minutes)
- Result: 210 minutes total (10 + 200)

### 3. Annual Plans Get All Minutes Upfront
- **Starter Annual**: 2,400 minutes immediately (200 × 12 months)
- **Pro Annual**: 3,600 minutes immediately (300 × 12 months)
- No monthly reset for annual plans
- Minutes never expire

### 4. Monthly Plans
- **Starter Monthly**: 200 minutes per month
- **Pro Monthly**: 300 minutes per month
- Reset date set for next month
- New minutes are ADDED to remaining balance each month

## Implementation Details

### Updated Functions

#### `MinutesModel.updatePlanAllocation(workspaceId, plan, billingCycle)`
- Now accepts `billingCycle` parameter ("monthly" | "annual")
- Calculates minutes based on billing cycle:
  - Annual: `planConfig.minutes.total × 12`
  - Monthly: `planConfig.minutes.total`
- Adds new minutes to existing remaining minutes
- Sets reset date only for monthly plans

#### `MinutesModel.resetMonthlyMinutes(workspaceId, plan)`
- Changed from replacing to adding minutes
- Preserves existing remaining minutes
- Adds new monthly allocation on top

#### `CreditController` Webhook Handlers
- Updated to pass `billingCycle` to `updatePlanAllocation()`
- Determines billing cycle from product ID

## Examples

### Example 1: New Starter Monthly Subscription
```
Before: 0 minutes
Purchase: Starter Monthly
After: 200 minutes
Reset Date: Next month
```

### Example 2: Existing User with Remaining Minutes
```
Before: 50 minutes remaining
Purchase: Starter Monthly
After: 250 minutes (50 + 200)
Reset Date: Next month
```

### Example 3: Annual Plan Purchase
```
Before: 10 minutes remaining
Purchase: Pro Annual
After: 3,610 minutes (10 + 3,600)
Reset Date: null (never expires)
```

### Example 4: Monthly Reset
```
Before: 75 minutes remaining
Monthly Reset: Starter plan
After: 275 minutes (75 + 200)
Reset Date: Next month
```

## Database Changes

No schema changes required. The existing `workspace_minutes` table supports:
- `minutesTotal`: Current plan allocation
- `minutesUsed`: Total minutes consumed (never reset)
- `minutesRemaining`: Available minutes (additive)
- `minutesResetDate`: When next allocation happens (null for annual)

## Benefits

1. **User-Friendly**: Users never lose unused minutes
2. **Fair**: Rewards users who don't use all their minutes
3. **Transparent**: Clear tracking of total usage vs. remaining balance
4. **Flexible**: Supports both monthly and annual billing cycles
5. **No Expiration**: Annual plan minutes never expire
