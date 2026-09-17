<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The matching key for GoHighLevelService's update-vs-create decision: once a user has
     * been synced, later syncs update this exact contact by ID (self-healing to an
     * email/phone-matched upsert if the stored ID ever 404s) instead of ever creating a
     * second contact for the same person.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('ghl_contact_id')->nullable()->after('avatar_url');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('ghl_contact_id');
        });
    }
};
