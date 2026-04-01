function Get-SLConnectionStatus {
    <#
    .SYNOPSIS
        Returns the current connection status for all StableLabel backends.
    .DESCRIPTION
        Queries the module-scoped $script:SLConnection hashtable and returns a
        PSCustomObject summarising which backends are connected, the signed-in
        user, tenant, timestamps, and session age for the Compliance session.
    .PARAMETER AsJson
        Return the status as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Get-SLConnectionStatus
    .EXAMPLE
        Get-SLConnectionStatus -AsJson
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [switch]$AsJson
    )

    process {
        $now = [datetime]::UtcNow

        # Calculate session ages where applicable
        $graphAge      = $null
        $complianceAge = $null
        $protectionAge = $null

        if ($script:SLConnection['ConnectedAt']['Graph']) {
            $graphAge = $now - $script:SLConnection['ConnectedAt']['Graph']
        }
        if ($script:SLConnection['ConnectedAt']['Compliance']) {
            $complianceAge = $now - $script:SLConnection['ConnectedAt']['Compliance']
        }
        if ($script:SLConnection['ConnectedAt']['Protection']) {
            $protectionAge = $now - $script:SLConnection['ConnectedAt']['Protection']
        }

        $complianceSessionAge = $null
        if ($script:SLConnection['ComplianceSessionStart']) {
            $complianceSessionAge = $now - $script:SLConnection['ComplianceSessionStart']
        }

        $result = [PSCustomObject]@{
            GraphConnected         = $script:SLConnection['GraphConnected']
            ComplianceConnected    = $script:SLConnection['ComplianceConnected']
            ProtectionConnected    = $script:SLConnection['ProtectionConnected']
            UserPrincipalName      = $script:SLConnection['UserPrincipalName']
            TenantId               = $script:SLConnection['TenantId']
            ConnectedAt            = [PSCustomObject]@{
                Graph      = $script:SLConnection['ConnectedAt']['Graph']
                Compliance = $script:SLConnection['ConnectedAt']['Compliance']
                Protection = $script:SLConnection['ConnectedAt']['Protection']
            }
            SessionAge             = [PSCustomObject]@{
                Graph      = $graphAge
                Compliance = $complianceAge
                Protection = $protectionAge
            }
            ComplianceCommandCount = $script:SLConnection['ComplianceCommandCount']
            ComplianceSessionStart = $script:SLConnection['ComplianceSessionStart']
            ComplianceSessionAge   = $complianceSessionAge
        }

        if ($AsJson) {
            return $result | ConvertTo-Json -Depth 20
        }

        return $result
    }
}
