#!/usr/bin/env bash
set -euo pipefail

# ── StableLabel — Entra ID App Registration Setup ──────────────
#
# Creates the two Azure AD (Entra ID) app registrations required:
#   1. "StableLabel" — user sign-in via MSAL (SPA)
#   2. "StableLabel Data Connector" — Graph API access (application permissions)
#
# Prerequisites:
#   - Azure CLI installed and logged in: az login
#   - You must be a Global Admin or Application Administrator
#
# Usage:
#   ./scripts/setup-entra-apps.sh
#
# The script outputs the values you need for your .env file.

echo "=== StableLabel Entra ID Setup ==="
echo ""

# Check az is logged in
if ! az account show &>/dev/null; then
    echo "ERROR: Not logged in. Run 'az login' first."
    exit 1
fi

TENANT_ID=$(az account show --query tenantId -o tsv)
echo "Tenant ID: $TENANT_ID"
echo ""

# ── 1. Auth app (SPA sign-in) ────────────────────────────────────

echo "Creating 'StableLabel' app registration (SPA auth)..."

AUTH_APP=$(az ad app create \
    --display-name "StableLabel" \
    --sign-in-audience AzureADMultipleOrgs \
    --web-redirect-uris "http://localhost:5173" "http://localhost:80" \
    --enable-id-token-issuance true \
    --query "{appId: appId, objectId: id}" \
    -o json)

AUTH_CLIENT_ID=$(echo "$AUTH_APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['appId'])")
AUTH_OBJECT_ID=$(echo "$AUTH_APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['objectId'])")

echo "  App ID: $AUTH_CLIENT_ID"

# Add app roles: Admin, Operator, Viewer
echo "  Adding app roles..."
az ad app update --id "$AUTH_OBJECT_ID" --app-roles '[
    {
        "allowedMemberTypes": ["User"],
        "displayName": "Admin",
        "description": "Full access — manage tenants, users, and all labelling operations",
        "isEnabled": true,
        "value": "Admin",
        "id": "'$(uuidgen)'"
    },
    {
        "allowedMemberTypes": ["User"],
        "displayName": "Operator",
        "description": "Create and manage labelling jobs, policies, and labels",
        "isEnabled": true,
        "value": "Operator",
        "id": "'$(uuidgen)'"
    },
    {
        "allowedMemberTypes": ["User"],
        "displayName": "Viewer",
        "description": "Read-only access to dashboards, reports, and audit logs",
        "isEnabled": true,
        "value": "Viewer",
        "id": "'$(uuidgen)'"
    }
]' 2>/dev/null || echo "  (App roles may already exist)"

# Create service principal so roles can be assigned
az ad sp create --id "$AUTH_CLIENT_ID" 2>/dev/null || true
echo "  Service principal created"
echo ""

# ── 2. Data Connector app (Graph API access) ─────────────────────

echo "Creating 'StableLabel Data Connector' app registration (Graph API)..."

CONNECTOR_APP=$(az ad app create \
    --display-name "StableLabel Data Connector" \
    --sign-in-audience AzureADMultipleOrgs \
    --query "{appId: appId, objectId: id}" \
    -o json)

CONNECTOR_CLIENT_ID=$(echo "$CONNECTOR_APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['appId'])")
CONNECTOR_OBJECT_ID=$(echo "$CONNECTOR_APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['objectId'])")

echo "  App ID: $CONNECTOR_CLIENT_ID"

# Add required Graph API application permissions
# These are granted per-tenant via admin consent
echo "  Requesting Graph API permissions..."

# Microsoft Graph API resource ID
GRAPH_API_ID="00000003-0000-0000-c000-000000000000"

# Required permissions (application type):
#   Sites.ReadWrite.All    — enumerate and access SharePoint sites
#   Files.ReadWrite.All    — read/write files for labelling
#   InformationProtection.Policy.Settings.ReadWrite.All — sensitivity labels
az ad app permission add \
    --id "$CONNECTOR_OBJECT_ID" \
    --api "$GRAPH_API_ID" \
    --api-permissions \
        "9492366f-7969-46a4-8d15-ed1a20078fff=Role" \
        "01d4f6a5-cbc1-4c97-801f-12ba581a5c25=Role" \
        "19da66cb-0571-4f29-8d8e-bfcc91f5fb84=Role" \
    2>/dev/null || echo "  (Permissions may already exist)"

# Create a client secret
echo "  Creating client secret (1 year validity)..."
SECRET_RESULT=$(az ad app credential reset \
    --id "$CONNECTOR_OBJECT_ID" \
    --display-name "StableLabel secret" \
    --years 1 \
    --query password -o tsv)

# Create service principal
az ad sp create --id "$CONNECTOR_CLIENT_ID" 2>/dev/null || true
echo "  Service principal created"
echo ""

# ── 3. Add consent redirect URI ──────────────────────────────────

echo "Adding consent redirect URI..."
az ad app update --id "$CONNECTOR_OBJECT_ID" \
    --web-redirect-uris "http://localhost:8000/onboard/callback"
echo ""

# ── Output ────────────────────────────────────────────────────────

echo "=============================================="
echo "  Setup complete! Add these to your .env file:"
echo "=============================================="
echo ""
echo "# Auth app (SPA sign-in)"
echo "SL_ENTRA_AUTH_CLIENT_ID=$AUTH_CLIENT_ID"
echo "VITE_ENTRA_CLIENT_ID=$AUTH_CLIENT_ID"
echo "VITE_ENTRA_AUTHORITY=https://login.microsoftonline.com/common"
echo ""
echo "# Data Connector app (Graph API)"
echo "SL_AZURE_CLIENT_ID=$CONNECTOR_CLIENT_ID"
echo "SL_AZURE_CLIENT_SECRET=$SECRET_RESULT"
echo ""
echo "# Consent callback"
echo "SL_CONSENT_REDIRECT_URI=http://localhost:8000/onboard/callback"
echo ""
echo "=============================================="
echo ""
echo "NEXT STEPS:"
echo "  1. Copy the values above into your .env file"
echo "  2. Assign yourself the Admin role:"
echo "     az ad app role assignment create \\"
echo "       --assignee YOUR_EMAIL \\"
echo "       --resource-id \$(az ad sp show --id $AUTH_CLIENT_ID --query id -o tsv) \\"
echo "       --role-id \$(az ad app show --id $AUTH_CLIENT_ID --query 'appRoles[?value==\`Admin\`].id' -o tsv)"
echo "  3. Run: docker compose up --build"
echo "  4. Run migrations: docker compose exec api python -m alembic upgrade head"
echo "  5. Open http://localhost:80"
echo ""
