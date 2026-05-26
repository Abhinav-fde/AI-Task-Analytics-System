# AI-Powered Smart Task Analytics & Event System
# Quick Start Script

echo "🚀 AI-Powered Smart Task Analytics"
echo "=================================="
echo ""

# Check if backend is running
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Backend is already running on http://localhost:3000"
else
    echo "📦 Starting backend server..."
    cd /workspace/project/backend
    node dist/index.js > /tmp/server.log 2>&1 &
    sleep 2
    
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Backend started successfully!"
    else
        echo "❌ Failed to start backend. Check logs:"
        cat /tmp/server.log
        exit 1
    fi
fi

echo ""
echo "📋 Available Endpoints:"
echo "   GET  http://localhost:3000/              - Root (health check)"
echo "   GET  http://localhost:3000/api/health   - API health check"
echo "   POST http://localhost:3000/api/tasks     - Create a task"
echo "   GET  http://localhost:3000/api/tasks     - List tasks"
echo ""
echo "💡 Example Commands:"
echo ""
echo "   # Create a task"
echo '   curl -X POST http://localhost:3000/api/tasks \'
echo '     -H "Content-Type: application/json" \'
echo '     -d '\''{"title": "My Task", "rawDescription": "Describe your task here", "userId": "user1"}'\'''
echo ""
echo "   # Get all tasks for a user"
echo "   curl 'http://localhost:3000/api/tasks?userId=user1'"
echo ""
echo "   # Get tasks filtered by status"
echo "   curl 'http://localhost:3000/api/tasks?userId=user1&status=completed'"
echo ""
echo "🎉 Happy coding!"
echo ""