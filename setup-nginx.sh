#!/bin/bash
set -e

echo "🌐 Setting up Nginx for ScaleReach"
echo "===================================="

# Check if domain is provided
if [ -z "$1" ]; then
    echo "Usage: ./setup-nginx.sh your-domain.com"
    exit 1
fi

DOMAIN=$1

# Install nginx if not present
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing Nginx..."
    sudo yum install nginx -y
fi

# Copy nginx config
echo "📝 Creating nginx configuration..."
sudo cp nginx.conf /etc/nginx/conf.d/scalereach.conf

# Replace domain placeholder
sudo sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/conf.d/scalereach.conf

# Test nginx config
echo "🔍 Testing nginx configuration..."
sudo nginx -t

# Start and enable nginx
echo "🚀 Starting nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

echo ""
echo "✅ Nginx setup complete!"
echo ""
echo "Your API is now accessible at: http://$DOMAIN"
echo ""
echo "🔒 To setup SSL (HTTPS):"
echo "   1. Install certbot: sudo yum install certbot python3-certbot-nginx -y"
echo "   2. Get certificate: sudo certbot --nginx -d $DOMAIN"
echo "   3. Auto-renewal is configured automatically"
echo ""
echo "📝 Nginx commands:"
echo "   Restart: sudo systemctl restart nginx"
echo "   Status: sudo systemctl status nginx"
echo "   Logs: sudo tail -f /var/log/nginx/error.log"
