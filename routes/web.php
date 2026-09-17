<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes (Single Page Application catch-all)
|--------------------------------------------------------------------------
*/

Route::get('/{any?}', function () {
    return view('app');
})->where('any', '^(?!api).*$');
