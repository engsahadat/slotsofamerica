<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->string('contact_display_mode')->nullable(); // 'icons_only' | 'icons_with_text'
            $table->string('contact_button_label')->nullable();
            $table->string('contact_header_title')->nullable();
            // Either a preset keyword ('bottom-right'|'bottom-left'|'top-right'|'top-left'|'custom')
            // or, when custom, a JSON-encoded {top?,bottom?,left?,right?} pixel-offset object.
            $table->string('contact_widget_position')->nullable();
            $table->string('contact_button_color')->nullable();
            $table->string('contact_text_color')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->dropColumn([
                'contact_display_mode',
                'contact_button_label',
                'contact_header_title',
                'contact_widget_position',
                'contact_button_color',
                'contact_text_color',
            ]);
        });
    }
};
