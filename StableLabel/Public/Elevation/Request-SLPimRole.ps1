function Request-SLPimRole {
    <#
    .SYNOPSIS
        Activates a PIM (Privileged Identity Management) eligible role assignment via Microsoft Graph API.
    .DESCRIPTION
        Submits a selfActivate request to the Graph API endpoint
        /roleManagement/directory/roleAssignmentScheduleRequests to activate
        an eligible Azure AD role. The activation includes a justification
        and a configurable duration.
    .PARAMETER RoleDefinitionId
        The GUID of the role definition to activate.
    .PARAMETER Justification
        A justification message for the role activation.
    .PARAMETER DurationHours
        The duration in hours for the role activation. Defaults to 8.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Request-SLPimRole -RoleDefinitionId '62e90394-69f5-4237-9190-012177145e10' -Justification 'Compliance investigation'
    .EXAMPLE
        Request-SLPimRole -RoleDefinitionId '62e90394-69f5-4237-9190-012177145e10' -Justification 'Audit review' -DurationHours 4
    .EXAMPLE
        Request-SLPimRole -RoleDefinitionId '62e90394-69f5-4237-9190-012177145e10' -Justification 'Test' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$RoleDefinitionId,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Justification,

        [ValidateRange(1, 24)]
        [int]$DurationHours = 8,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Graph
    }

    process {
        $target = "role '$RoleDefinitionId'"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            RoleDefinitionId = $RoleDefinitionId
            Justification    = $Justification
            DurationHours    = $DurationHours
            ElevationType    = [SLElevationType]::PimRole
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Request-PimRole' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action           = 'Request-PimRole'
                RoleDefinitionId = $RoleDefinitionId
                Justification    = $Justification
                DurationHours    = $DurationHours
                DryRun           = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Activate PIM eligible role')) {
            return
        }

        try {
            Write-Verbose "Activating PIM role '$RoleDefinitionId' for $DurationHours hour(s)."

            # Get the current user's principal ID from the connection
            $principalId = $script:SLConnection.UserId
            if (-not $principalId) {
                # Fallback: query Graph for the signed-in user
                $me = Invoke-SLGraphRequest -Method GET -Uri '/me'
                $principalId = $me.id
            }

            $body = @{
                action           = 'selfActivate'
                principalId      = $principalId
                roleDefinitionId = $RoleDefinitionId
                directoryScopeId = '/'
                justification    = $Justification
                scheduleInfo     = @{
                    startDateTime = [datetime]::UtcNow.ToString('o')
                    expiration    = @{
                        type     = 'AfterDuration'
                        duration = "PT${DurationHours}H"
                    }
                }
            }

            $response = Invoke-SLGraphRequest -Method POST `
                -Uri '/roleManagement/directory/roleAssignmentScheduleRequests' `
                -Body $body

            Write-SLAuditEntry -Action 'Request-PimRole' -Target $target -Detail $detail -Result 'success'

            $result = [PSCustomObject]@{
                Action           = 'Request-PimRole'
                RoleDefinitionId = $RoleDefinitionId
                PrincipalId      = $principalId
                Justification    = $Justification
                DurationHours    = $DurationHours
                Status           = $response.status
                RequestId        = $response.id
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Request-PimRole' -Target $target -Detail $detail -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
