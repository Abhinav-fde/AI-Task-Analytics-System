#!/bin/bash

# ╔══════════════════════════════════════════════════════════╗
# ║       AI-POWERED SMART TASK ANALYTICS - LIVE DEMO       ║
# ╚══════════════════════════════════════════════════════════╝

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       AI-POWERED SMART TASK ANALYTICS - LIVE DEMO       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend not running! Starting it...${NC}"
    cd /workspace/project/backend
    node dist/index.js &
    sleep 3
fi

echo -e "${GREEN}✅ Server is running at http://localhost:3000${NC}"
echo ""

# Demo function
demo() {
    local title="$1"
    local description="$2"
    local user="$3"
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📋 Creating: $title${NC}"
    echo ""
    echo "   Description: $description"
    echo "   User: $user"
    echo ""
    
    # Create task
    echo -e "${YELLOW}→ POST /api/tasks${NC}"
    response=$(curl -s -X POST http://localhost:3000/api/tasks \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"$title\",\"rawDescription\":\"$description\",\"userId\":\"$user\"}")
    
    echo "   Response: $response"
    echo -e "${GREEN}   ✓ Task created! AI processing in background...${NC}"
    echo ""
    
    # Wait for AI
    echo "   Waiting for AI (3s)..."
    sleep 3
    
    # Get result
    echo -e "${YELLOW}→ GET /api/tasks?userId=$user${NC}"
    result=$(curl -s "http://localhost:3000/api/tasks?userId=$user")
    
    # Parse JSON
    echo "$result" | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    task = data['data'][0] if data['data'] else {}
    print(f'   Title: {task.get(\"title\", \"N/A\")}')
    print(f'   Status: {task.get(\"aiStatus\", \"N/A\")}')
    print(f'   Subtasks: {len(task.get(\"automatedSubtasks\", []))}')
    print()
    for i, sub in enumerate(task.get('automatedSubtasks', []), 1):
        print(f'      {i}. [{sub[\"complexityEstimation\"].upper()}] {sub[\"title\"]}')
except:
    print('   Error parsing response')
"
    echo ""
}

echo -e "${GREEN}🎯 DEMO 1: Web Application${NC}"
demo "Build E-commerce Platform" "Create a full-stack e-commerce app with user authentication, product catalog, shopping cart, payment integration, and order management" "demo-user-1"

echo ""
echo -e "${GREEN}🎯 DEMO 2: API Development${NC}"
demo "Design Microservices Architecture" "Build a microservices system with API gateway, authentication service, user service, notification service, and message queue" "demo-user-2"

echo ""
echo -e "${GREEN}🎯 DEMO 3: DevOps${NC}"
demo "Kubernetes Deployment" "Set up Kubernetes cluster, configure CI/CD pipeline, implement monitoring with Prometheus and Grafana, setup logging with ELK stack" "demo-user-3"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗"
echo "║                    DEMO COMPLETE!                       ║"
echo "╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "💡 Try in terminal:"
echo "   curl http://localhost:3000/api/health"
echo "   curl 'http://localhost:3000/api/tasks?userId=demo-user-1'"
echo ""