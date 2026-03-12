function Restore-SLDocumentAccess {
    <#
    .SYNOPSIS
        Restores access to a previously revoked protected document.
    .DESCRIPTION
        Wraps Clear-AipServiceDocumentRevoked via Invoke-SLProtectionCommand.
        Un-revokes a document identified by its content ID and issuer email,
        restoring access to previously revoked content.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER ContentId
        The content ID of the document to restore access for.
    .PARAMETER IssuerEmail
        The email address of the document issuer.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Restore-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com'
    .EXAMPLE
        Restore-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$ContentId,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$IssuerEmail,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            ContentId   = $ContentId
            IssuerEmail = $IssuerEmail
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Clear-AipServiceDocumentRevoked' -Target $ContentId -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action      = 'Clear-AipServiceDocumentRevoked'
                ContentId   = $ContentId
                IssuerEmail = $IssuerEmail
                DryRun      = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($ContentId, 'Restore document access')) {
            return
        }

        try {
            Write-Verbose "Restoring access for document: $ContentId"

            $result = Invoke-SLProtectionCommand -OperationName "Clear-AipServiceDocumentRevoked '$ContentId'" -ScriptBlock {
                Clear-AipServiceDocumentRevoked -ContentId $ContentId -IssuerEmail $IssuerEmail
            }

            Write-SLAuditEntry -Action 'Clear-AipServiceDocumentRevoked' -Target $ContentId -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Clear-AipServiceDocumentRevoked' -Target $ContentId -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
