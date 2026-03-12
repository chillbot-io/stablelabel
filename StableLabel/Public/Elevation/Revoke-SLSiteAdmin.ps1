function Revoke-SLSiteAdmin {
    <#
    .SYNOPSIS
        Removes site collection administrator rights from a user via Microsoft Graph API.
    .DESCRIPTION
        Uses the Graph API to remove a user as a site collection administrator
        on a SharePoint site. Locates the matching permission entry and deletes it.
    .PARAMETER SiteUrl
        The URL of the SharePoint site collection.
    .PARAMETER UserPrincipalName
        The UPN of the user to remove site admin rights from.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Revoke-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com'
    .EXAMPLE
        Revoke-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$SiteUrl,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$UserPrincipalName,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Graph
    }

    process {
        $target = "site '$SiteUrl', user '$UserPrincipalName'"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            SiteUrl           = $SiteUrl
            UserPrincipalName = $UserPrincipalName
            ElevationType     = [SLElevationType]::SiteAdmin
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Revoke-SiteAdmin' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action            = 'Revoke-SiteAdmin'
                SiteUrl           = $SiteUrl
                UserPrincipalName = $UserPrincipalName
                DryRun            = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Revoke site collection administrator')) {
            return
        }

        try {
            Write-Verbose "Revoking site admin from '$UserPrincipalName' on '$SiteUrl'."

            # Parse the site URL to derive the Graph site identifier
            $siteUri = [System.Uri]$SiteUrl
            $hostname = $siteUri.Host
            $sitePath = $siteUri.AbsolutePath.TrimEnd('/')

            # Resolve the site ID via Graph
            $site = Invoke-SLGraphRequest -Method GET -Uri "/sites/${hostname}:${sitePath}"
            $siteId = $site.id

            # Look up the user to get their directory ID
            $encodedUpn = [System.Uri]::EscapeDataString($UserPrincipalName)
            $user = Invoke-SLGraphRequest -Method GET -Uri "/users/$encodedUpn"

            # List site permissions and find the matching entry
            $permissions = Invoke-SLGraphRequest -Method GET -Uri "/sites/$siteId/permissions"
            $matchingPerm = $permissions | Where-Object {
                $_.grantedToIdentitiesV2 | ForEach-Object {
                    $_.user.id -eq $user.id
                }
            } | Select-Object -First 1

            if (-not $matchingPerm) {
                Write-Warning "No site admin permission found for '$UserPrincipalName' on '$SiteUrl'."
                return
            }

            # Delete the permission
            Invoke-SLGraphRequest -Method DELETE -Uri "/sites/$siteId/permissions/$($matchingPerm.id)"

            Write-SLAuditEntry -Action 'Revoke-SiteAdmin' -Target $target -Detail $detail -Result 'success'

            $result = [PSCustomObject]@{
                Action            = 'Revoke-SiteAdmin'
                SiteUrl           = $SiteUrl
                SiteId            = $siteId
                UserPrincipalName = $UserPrincipalName
                RemovedPermId     = $matchingPerm.id
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Revoke-SiteAdmin' -Target $target -Detail $detail -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
