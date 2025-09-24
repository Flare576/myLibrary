FROM php:8.3-apache

RUN apt-get update && apt-get install -y \
    libzip-dev \
    default-libmysqlclient-dev \
    && docker-php-ext-configure zip \
    && docker-php-ext-install pdo pdo_mysql zip intl gd \
    && a2enmod rewrite

# Copy app code
COPY . /var/www/html

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html/cache