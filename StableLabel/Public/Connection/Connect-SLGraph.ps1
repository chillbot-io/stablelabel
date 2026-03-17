function Connect-SLGraph {
    <#
    .SYNOPSIS
        Connects to Microsoft Graph with the scopes required by StableLabel.
    .DESCRIPTION
        Wraps Connect-MgGraph, requesting the scopes needed for sensitivity-label
        and site operations. After connecting it stores context information in the
        module-scoped $script:SLConnection hashtable.
    .PARAMETER TenantId
        Optional Azure AD / Entra ID tenant ID to connect to. When omitted the
        default tenant for the signed-in account is used.
    .PARAMETER Scopes
        Additional Microsoft Graph scopes to request beyond the StableLabel
        defaults. The defaults are always included.
    .PARAMETER UseDeviceCode
        Use the device-code authentication flow instead of interactive browser
        sign-in. The command will output a URL and code that the user must enter
        in a browser to complete authentication. This is required when running
        in non-interactive environments (e.g. the StableLabel GUI).
    .PARAMETER AsJson
        Return the connection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLGraph
    .EXAMPLE
        Connect-SLGraph -TenantId 'contoso.onmicrosoft.com'
    .EXAMPLE
        Connect-SLGraph -UseDeviceCode -AsJson
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$TenantId,

        [Parameter()]
        [string[]]$Scopes,

        [Parameter()]
        [switch]$UseDeviceCode,

        [Parameter()]
        [switch]$AsJson
    )

    begin {
        $requiredScopes = @(
            'InformationProtectionPolicy.Read.All'
            'Files.ReadWrite.All'
            'Sites.ReadWrite.All'
            'Group.Read.All'
            'User.Read'
            'offline_access'
        )

        if ($Scopes) {
            $requiredScopes = @($requiredScopes) + @($Scopes) | Select-Object -Unique
        }
    }

    process {
        try {
            Write-Verbose "Connecting to Microsoft Graph with $($requiredScopes.Count) scopes."

            $connectParams = @{
                Scopes    = $requiredScopes
                NoWelcome = $true
            }

            if ($TenantId) {
                $connectParams['TenantId'] = $TenantId
            }

            if ($UseDeviceCode) {
                $connectParams['UseDeviceCode'] = $true
            }

            Connect-MgGraph @connectParams -ErrorAction Stop

            $context = Get-MgContext -ErrorAction Stop

            $script:SLConnection['GraphConnected']    = $true
            $script:SLConnection['UserPrincipalName'] = $context.Account
            $script:SLConnection['TenantId']          = $context.TenantId
            $script:SLConnection['ConnectedAt']['Graph'] = [datetime]::UtcNow

            $result = [PSCustomObject]@{
                Status            = 'Connected'
                Backend           = 'Graph'
                UserPrincipalName = $context.Account
                TenantId          = $context.TenantId
                Scopes            = $requiredScopes
                ConnectedAt       = $script:SLConnection['ConnectedAt']['Graph']
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            $script:SLConnection['GraphConnected'] = $false
            throw "Failed to connect to Microsoft Graph: $_"
        }
    }
}
