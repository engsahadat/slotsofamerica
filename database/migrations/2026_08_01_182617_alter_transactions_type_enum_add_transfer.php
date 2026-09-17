<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The unused transfer_in/transfer_out values (from an earlier instant-transfer design
     * that nothing in the app references anymore) are replaced with a single 'transfer'
     * value, matching the pending-review Transaction rows now created by
     * UserTransferApiController and read by AdminTransactionApiController/AdminTransactions.tsx.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit', 'withdraw', 'redeem', 'transfer', 'reward') NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit', 'withdraw', 'redeem', 'transfer_in', 'transfer_out', 'reward') NOT NULL");
        }
    }
};
