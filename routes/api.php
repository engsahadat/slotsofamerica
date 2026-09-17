<?php

use App\Http\Controllers\Api\Admin\AdminActivityLogApiController;
use App\Http\Controllers\Api\Admin\AdminBackupApiController;
use App\Http\Controllers\Api\Admin\AdminEmailTemplateApiController;
use App\Http\Controllers\Api\Admin\AdminExportRequestApiController;
use App\Http\Controllers\Api\Admin\AdminGameAccessApiController;
use App\Http\Controllers\Api\Admin\AdminGameApiController;
use App\Http\Controllers\Api\Admin\AdminGameApiProviderController;
use App\Http\Controllers\Api\Admin\AdminNotificationApiController;
use App\Http\Controllers\Api\Admin\AdminOverviewApiController;
use App\Http\Controllers\Api\Admin\AdminPaymentGatewayApiController;
use App\Http\Controllers\Api\Admin\AdminRedeemSettingsApiController;
use App\Http\Controllers\Api\Admin\AdminRewardsApiController;
use App\Http\Controllers\Api\Admin\AdminRlsDiagnosticsApiController;
use App\Http\Controllers\Api\Admin\AdminSiteSettingsApiController;
use App\Http\Controllers\Api\Admin\AdminSupportChannelApiController;
use App\Http\Controllers\Api\Admin\AdminTransactionApiController;
use App\Http\Controllers\Api\Admin\AdminUserApiController;
use App\Http\Controllers\Api\Admin\AdminVerificationApiController;
use App\Http\Controllers\Api\Admin\AdminWithdrawMethodApiController;
use App\Http\Controllers\Api\AuthApiController;
use App\Http\Controllers\Api\ExternalApiController;
use App\Http\Controllers\Api\FastPaymentWebhookController;
use App\Http\Controllers\Api\UploadApiController;
use App\Http\Controllers\Api\User\FastPaymentApiController;
use App\Http\Controllers\Api\User\UserDashboardApiController;
use App\Http\Controllers\Api\User\UserDepositApiController;
use App\Http\Controllers\Api\User\UserGameApiController;
use App\Http\Controllers\Api\User\UserNotificationApiController;
use App\Http\Controllers\Api\User\UserRedeemApiController;
use App\Http\Controllers\Api\User\UserSettingsApiController;
use App\Http\Controllers\Api\User\UserTransactionApiController;
use App\Http\Controllers\Api\User\UserTransferApiController;
use App\Http\Controllers\Api\User\UserWithdrawApiController;
use App\Http\Controllers\Api\User\VerificationApiController;
use App\Http\Middleware\AdminMiddleware;
use App\Http\Middleware\JwtAuthMiddleware;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes Indexing (JWT Authentication)
|--------------------------------------------------------------------------
*/

// External Game Agent Integration API (Catalog Spec)
Route::match(['get', 'post'], '/external/addUser', [ExternalApiController::class, 'addUser']);
Route::match(['get', 'post'], '/external/recharge', [ExternalApiController::class, 'recharge']);
Route::match(['get', 'post'], '/external/withdraw', [ExternalApiController::class, 'withdraw']);
Route::match(['get', 'post'], '/external/userBalance', [ExternalApiController::class, 'userBalance']);
Route::match(['get', 'post'], '/external/agentBalance', [ExternalApiController::class, 'agentBalance']);
Route::match(['get', 'post'], '/external/getUserID', [ExternalApiController::class, 'getUserID']);
Route::match(['get', 'post'], '/external/getLowDepositUsers', [ExternalApiController::class, 'getLowDepositUsers']);
Route::match(['get', 'post'], '/external/external/getLowDepositUsers', [ExternalApiController::class, 'getLowDepositUsers']);
Route::match(['get', 'post'], '/external/resetPassword', [ExternalApiController::class, 'resetPassword']);
Route::match(['get', 'post'], '/external/playerOffline', [ExternalApiController::class, 'playerOffline']);

// Public Authentication, Games & Settings Routes
Route::post('/auth/register', [AuthApiController::class, 'register']);
Route::post('/auth/login', [AuthApiController::class, 'login']);
Route::post('/auth/forgot-password', [AuthApiController::class, 'forgotPassword']);
Route::post('/auth/reset-password', [AuthApiController::class, 'resetPassword']);
Route::get('/site-settings', [AdminSiteSettingsApiController::class, 'publicSettings']);
Route::get('/support-channels', [AdminSupportChannelApiController::class, 'publicIndex']);
Route::get('/games', [UserGameApiController::class, 'index']);
Route::get('/payment-gateways', [UserDepositApiController::class, 'index']);

// FAST Payment (DollarPayWallet/Kashuuu) async webhook — public by necessity (called by the
// gateway's own servers, not our frontend), signature-verified inside the controller itself.
Route::post('/webhooks/fast-payment', [FastPaymentWebhookController::class, 'notify']);

// Protected User Routes (Requires JWT Auth)
Route::middleware(JwtAuthMiddleware::class)->group(function () {
    Route::get('/auth/me', [AuthApiController::class, 'me']);
    Route::post('/auth/logout', [AuthApiController::class, 'logout']);

    Route::post('/upload', [UploadApiController::class, 'store']);

    // User Portal API Endpoints
    Route::get('/user/dashboard', [UserDashboardApiController::class, 'index']);
    Route::get('/user/deposit/gateways', [UserDepositApiController::class, 'index']);
    Route::post('/user/deposit', [UserDepositApiController::class, 'store']);

    // FAST Payment (automated deposit) — separate path alongside the manual gateway flow above.
    Route::post('/user/deposit/fast-payment', [FastPaymentApiController::class, 'store']);
    Route::get('/user/deposit/fast-payment/{orderSn}/status', [FastPaymentApiController::class, 'status']);

    Route::get('/user/withdraw/methods', [UserWithdrawApiController::class, 'index']);
    Route::post('/user/withdraw', [UserWithdrawApiController::class, 'store']);
    Route::post('/user/withdraw/{id}/cancel', [UserWithdrawApiController::class, 'cancel']);

    Route::post('/user/transfer', [UserTransferApiController::class, 'transfer']);

    Route::get('/user/redeem/rewards', [UserRedeemApiController::class, 'index']);
    Route::post('/user/redeem', [UserRedeemApiController::class, 'redeem']);
    Route::post('/user/redeem/request', [UserRedeemApiController::class, 'submitCashout']);

    Route::get('/user/transactions', [UserTransactionApiController::class, 'index']);

    Route::get('/user/games', [UserGameApiController::class, 'index']);
    Route::post('/user/games/unlock', [UserGameApiController::class, 'requestUnlock']);
    Route::post('/user/games/password-reset', [UserGameApiController::class, 'requestPasswordReset']);
    Route::get('/user/games/password-requests', [UserGameApiController::class, 'passwordRequestHistory']);

    // Game Specific Access, Registration, Login & Password Reset APIs
    Route::get('/games/{gameId}/access', [UserGameApiController::class, 'checkAccess']);
    Route::post('/games/{gameId}/register', [UserGameApiController::class, 'requestUnlock']);
    Route::post('/games/{gameId}/login', [UserGameApiController::class, 'login']);
    Route::post('/games/{gameId}/password-reset', [UserGameApiController::class, 'requestPasswordReset']);
    Route::post('/user/games/login', [UserGameApiController::class, 'login']);

    Route::get('/user/notifications', [UserNotificationApiController::class, 'index']);
    Route::post('/user/notifications/{id}/read', [UserNotificationApiController::class, 'markRead']);
    Route::post('/user/notifications/read-all', [UserNotificationApiController::class, 'markAllRead']);

    Route::post('/user/settings/profile', [UserSettingsApiController::class, 'updateProfile']);
    Route::post('/user/settings/password', [UserSettingsApiController::class, 'updatePassword']);

    Route::post('/user/verification/email/send', [VerificationApiController::class, 'sendEmailOtp']);
    Route::post('/user/verification/phone/send', [VerificationApiController::class, 'sendPhoneOtp']);
    Route::post('/user/verification/verify', [VerificationApiController::class, 'verifyOtp']);
    Route::post('/user/verification/phone/manual-request', [VerificationApiController::class, 'requestManualPhoneVerification']);
    Route::get('/user/reward-history', [UserRedeemApiController::class, 'history']);

    // Protected Admin Routes (Requires Admin Middleware)
    Route::middleware(AdminMiddleware::class)->prefix('admin')->group(function () {
        Route::get('/overview', [AdminOverviewApiController::class, 'index']);
        Route::get('/activity-log', [AdminActivityLogApiController::class, 'index']);
        Route::delete('/activity-log/{id}', [AdminActivityLogApiController::class, 'destroy']);
        Route::delete('/activity-log', [AdminActivityLogApiController::class, 'clear']);

        // Admin User Management
        Route::get('/users', [AdminUserApiController::class, 'index']);
        Route::post('/users', [AdminUserApiController::class, 'store']);
        Route::get('/users/{id}', [AdminUserApiController::class, 'show']);
        Route::delete('/users/{id}', [AdminUserApiController::class, 'destroy']);
        Route::post('/users/{id}/balance', [AdminUserApiController::class, 'adjustBalance']);
        Route::post('/users/{id}/flag', [AdminUserApiController::class, 'toggleFlag']);
        Route::post('/users/{id}/role', [AdminUserApiController::class, 'updateRole']);

        // Admin Games Management
        Route::get('/games', [AdminGameApiController::class, 'index']);
        Route::post('/games', [AdminGameApiController::class, 'store']);
        Route::put('/games/{id}', [AdminGameApiController::class, 'update']);
        Route::delete('/games/{id}', [AdminGameApiController::class, 'destroy']);
        Route::get('/games/{gameId}/accounts', [AdminGameApiController::class, 'accounts']);
        Route::post('/games/{gameId}/accounts', [AdminGameApiController::class, 'storeAccount']);
        Route::put('/games/{gameId}/accounts/{accountId}', [AdminGameApiController::class, 'updateAccount']);
        Route::delete('/games/{gameId}/accounts/{accountId}', [AdminGameApiController::class, 'destroyAccount']);

        // Admin Transactions Management
        Route::get('/transactions', [AdminTransactionApiController::class, 'index']);
        Route::get('/transactions/export', [AdminTransactionApiController::class, 'export']);
        Route::get('/transactions/pending-counts', [AdminTransactionApiController::class, 'pendingCounts']);
        Route::post('/transactions', [AdminTransactionApiController::class, 'store']);
        Route::delete('/transactions/{id}', [AdminTransactionApiController::class, 'destroy']);
        Route::post('/transactions/{id}/review', [AdminTransactionApiController::class, 'review']);
        Route::post('/transactions/{id}/undo', [AdminTransactionApiController::class, 'undo']);
        Route::post('/transactions/{id}/edit-amount', [AdminTransactionApiController::class, 'editAmount']);
        Route::get('/transactions/{id}/logs', [AdminTransactionApiController::class, 'logs']);

        // Admin Game Access Requests
        Route::get('/game-access', [AdminGameAccessApiController::class, 'index']);
        Route::post('/game-access/unlock/{id}/review', [AdminGameAccessApiController::class, 'reviewUnlock']);
        Route::put('/game-access/unlock/{id}', [AdminGameAccessApiController::class, 'updateUnlock']);
        Route::delete('/game-access/unlock/{id}', [AdminGameAccessApiController::class, 'destroyUnlock']);
        Route::post('/game-access/password/{id}/review', [AdminGameAccessApiController::class, 'reviewPasswordRequest']);
        Route::delete('/game-access/password/{id}', [AdminGameAccessApiController::class, 'destroyPasswordRequest']);
        Route::post('/game-access/unlock/{id}/auto-create', [AdminGameAccessApiController::class, 'autoCreate']);

        // Admin Game API Providers (generic multi-provider integration console)
        Route::get('/game-api-providers', [AdminGameApiProviderController::class, 'index']);
        Route::post('/game-api-providers', [AdminGameApiProviderController::class, 'store']);
        Route::put('/game-api-providers/{id}', [AdminGameApiProviderController::class, 'update']);
        Route::delete('/game-api-providers/{id}', [AdminGameApiProviderController::class, 'destroy']);
        Route::post('/game-api-providers/{id}/toggle', [AdminGameApiProviderController::class, 'toggleField']);
        Route::post('/game-api-providers/{id}/password', [AdminGameApiProviderController::class, 'setPassword']);
        Route::post('/game-api-providers/{id}/test', [AdminGameApiProviderController::class, 'testConnection']);
        Route::post('/game-api-providers/{id}/health', [AdminGameApiProviderController::class, 'healthCheck']);
        Route::post('/game-api-providers/{id}/e2e-test', [AdminGameApiProviderController::class, 'e2eTest']);
        Route::get('/game-api-providers/{id}/logs', [AdminGameApiProviderController::class, 'providerLogs']);
        Route::post('/game-api-providers/override', [AdminGameApiProviderController::class, 'manualOverride']);
        Route::post('/game-provider-assignments', [AdminGameApiProviderController::class, 'setAssignment']);

        // Admin Payment Gateways
        Route::get('/payment-gateways', [AdminPaymentGatewayApiController::class, 'index']);
        Route::post('/payment-gateways', [AdminPaymentGatewayApiController::class, 'store']);
        Route::put('/payment-gateways/{id}', [AdminPaymentGatewayApiController::class, 'update']);
        Route::delete('/payment-gateways/{id}', [AdminPaymentGatewayApiController::class, 'destroy']);
        Route::post('/payment-gateways/{gatewayId}/accounts', [AdminPaymentGatewayApiController::class, 'storeAccount']);
        Route::put('/payment-gateways/{gatewayId}/accounts/{accountId}', [AdminPaymentGatewayApiController::class, 'updateAccount']);
        Route::delete('/payment-gateways/{gatewayId}/accounts/{accountId}', [AdminPaymentGatewayApiController::class, 'destroyAccount']);

        // Admin Withdraw Methods
        Route::get('/withdraw-methods', [AdminWithdrawMethodApiController::class, 'index']);
        Route::get('/withdraw-methods/daily-limit', [AdminWithdrawMethodApiController::class, 'dailyLimit']);
        Route::post('/withdraw-methods/daily-limit', [AdminWithdrawMethodApiController::class, 'updateDailyLimit']);
        Route::post('/withdraw-methods', [AdminWithdrawMethodApiController::class, 'store']);
        Route::put('/withdraw-methods/{id}', [AdminWithdrawMethodApiController::class, 'update']);
        Route::delete('/withdraw-methods/{id}', [AdminWithdrawMethodApiController::class, 'destroy']);
        Route::post('/withdraw-methods/{methodId}/fields', [AdminWithdrawMethodApiController::class, 'storeField']);
        Route::put('/withdraw-methods/{methodId}/fields/{fieldId}', [AdminWithdrawMethodApiController::class, 'updateField']);
        Route::delete('/withdraw-methods/{methodId}/fields/{fieldId}', [AdminWithdrawMethodApiController::class, 'destroyField']);

        // Admin Redeem Settings
        Route::get('/redeem-settings', [AdminRedeemSettingsApiController::class, 'index']);
        Route::post('/redeem-settings', [AdminRedeemSettingsApiController::class, 'update']);

        // Admin Rewards Rules
        Route::get('/rewards', [AdminRewardsApiController::class, 'index']);
        Route::post('/rewards', [AdminRewardsApiController::class, 'store']);
        Route::put('/rewards/{id}', [AdminRewardsApiController::class, 'update']);
        Route::delete('/rewards/{id}', [AdminRewardsApiController::class, 'destroy']);

        // Admin Verification Management
        Route::get('/verifications/users', [AdminVerificationApiController::class, 'users']);
        Route::post('/verifications/toggle', [AdminVerificationApiController::class, 'toggleUserVerification']);
        Route::get('/verifications/settings', [AdminVerificationApiController::class, 'settings']);
        Route::post('/verifications/settings', [AdminVerificationApiController::class, 'updateSettings']);
        Route::get('/verifications/codes', [AdminVerificationApiController::class, 'codes']);
        Route::get('/verifications/history', [AdminVerificationApiController::class, 'history']);
        Route::post('/verifications/codes/invalidate', [AdminVerificationApiController::class, 'invalidateCodes']);
        Route::post('/verifications/test-email', [AdminVerificationApiController::class, 'testEmail']);
        Route::post('/verifications/test-sms', [AdminVerificationApiController::class, 'testSms']);
        Route::post('/verifications/test-email-otp', [AdminVerificationApiController::class, 'testEmailOtp']);
        Route::get('/verifications/phone-requests', [AdminVerificationApiController::class, 'phoneRequests']);
        Route::post('/verifications/phone-requests/{id}/approve', [AdminVerificationApiController::class, 'approvePhoneRequest']);
        Route::post('/verifications/phone-requests/{id}/reject', [AdminVerificationApiController::class, 'rejectPhoneRequest']);

        // Admin Notifications
        Route::get('/notifications', [AdminNotificationApiController::class, 'index']);
        Route::post('/notifications/broadcast', [AdminNotificationApiController::class, 'broadcast']);
        Route::delete('/notifications/{id}', [AdminNotificationApiController::class, 'destroy']);

        // Admin Email Templates
        Route::get('/email-templates', [AdminEmailTemplateApiController::class, 'index']);
        Route::post('/email-templates', [AdminEmailTemplateApiController::class, 'store']);
        Route::put('/email-templates/{id}', [AdminEmailTemplateApiController::class, 'update']);
        Route::delete('/email-templates/{id}', [AdminEmailTemplateApiController::class, 'destroy']);
        Route::post('/email-templates/{id}/duplicate', [AdminEmailTemplateApiController::class, 'duplicate']);
        Route::post('/email-templates/send-test', [AdminEmailTemplateApiController::class, 'sendTest']);

        // Admin Site Settings & Support Channels
        Route::get('/site-settings', [AdminSiteSettingsApiController::class, 'index']);
        Route::post('/site-settings', [AdminSiteSettingsApiController::class, 'update']);
        Route::get('/support-channels', [AdminSupportChannelApiController::class, 'index']);
        Route::post('/support-channels', [AdminSupportChannelApiController::class, 'store']);
        Route::put('/support-channels/{id}', [AdminSupportChannelApiController::class, 'update']);
        Route::delete('/support-channels/{id}', [AdminSupportChannelApiController::class, 'destroy']);

        // Admin Backup & Recovery
        Route::get('/backups', [AdminBackupApiController::class, 'index']);
        Route::post('/backups', [AdminBackupApiController::class, 'store']);
        Route::get('/backups/{id}/download', [AdminBackupApiController::class, 'download']);
        Route::post('/backups/{id}/restore', [AdminBackupApiController::class, 'restore']);
        Route::delete('/backups/{id}', [AdminBackupApiController::class, 'destroy']);
        Route::post('/backups/restore-upload', [AdminBackupApiController::class, 'restoreUpload']);
        Route::get('/backups/customers/export', [AdminBackupApiController::class, 'exportCustomers']);
        Route::post('/backups/storage/export', [AdminBackupApiController::class, 'exportStorage']);
        Route::post('/backups/storage/import', [AdminBackupApiController::class, 'importStorage']);
        Route::get('/backups/env-snapshot', [AdminBackupApiController::class, 'envSnapshot']);
        Route::get('/recovery-config', [AdminBackupApiController::class, 'getRecoveryConfig']);
        Route::post('/recovery-config', [AdminBackupApiController::class, 'saveRecoveryConfig']);

        // Admin Export Requests (manager-requests / admin-approves transaction export workflow)
        Route::get('/export-requests', [AdminExportRequestApiController::class, 'index']);
        Route::post('/export-requests', [AdminExportRequestApiController::class, 'store']);
        Route::post('/export-requests/sweep-expired', [AdminExportRequestApiController::class, 'sweepExpired']);
        Route::post('/export-requests/{id}/approve', [AdminExportRequestApiController::class, 'approve']);
        Route::post('/export-requests/{id}/reject', [AdminExportRequestApiController::class, 'reject']);
        Route::post('/export-requests/{id}/consume', [AdminExportRequestApiController::class, 'consumeApproval']);
        Route::delete('/export-requests/{id}', [AdminExportRequestApiController::class, 'destroy']);

        // Admin RLS Diagnostics (table/policy coverage report — see controller docblock for
        // how this adapts the reference project's Postgres-RLS-specific page to Laravel/MySQL)
        Route::get('/rls-diagnostics', [AdminRlsDiagnosticsApiController::class, 'index']);
    });
});
