@{
    RootModule        = 'StableLabel.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    Author            = 'StableLabel Contributors'
    CompanyName       = 'StableLabel'
    Copyright         = '(c) 2026 StableLabel Contributors. All rights reserved.'
    Description       = 'Unified Microsoft Purview compliance management - sensitivity labels, retention labels, DLP policies, snapshot/rollback, privilege elevation, and bulk operations.'
    PowerShellVersion = '7.0'
    RequiredModules   = @(
        @{ ModuleName = 'Microsoft.Graph.Authentication'; ModuleVersion = '2.10.0' }
        @{ ModuleName = 'ExchangeOnlineManagement'; ModuleVersion = '3.2.0' }
    )
    FunctionsToExport = @(
        # Connection
        'Connect-SLGraph'
        'Connect-SLCompliance'
        'Connect-SLAll'
        'Connect-SLProtection'
        'Disconnect-SLGraph'
        'Disconnect-SLCompliance'
        'Disconnect-SLProtection'
        'Get-SLConnectionStatus'

        # Labels
        'Get-SLLabel'
        'Get-SLLabelPolicy'
        'New-SLLabelPolicy'
        'Set-SLLabelPolicy'
        'Remove-SLLabelPolicy'
        'Get-SLAutoLabelPolicy'
        'New-SLAutoLabelPolicy'
        'Set-SLAutoLabelPolicy'
        'Remove-SLAutoLabelPolicy'
        'Get-SLDocumentLabel'
        'Set-SLDocumentLabel'
        'Remove-SLDocumentLabel'
        'Set-SLDocumentLabelBulk'

        # Retention
        'Get-SLRetentionLabel'
        'New-SLRetentionLabel'
        'Set-SLRetentionLabel'
        'Remove-SLRetentionLabel'
        'Get-SLRetentionPolicy'
        'New-SLRetentionPolicy'
        'Set-SLRetentionPolicy'
        'Remove-SLRetentionPolicy'

        # DLP
        'Get-SLDlpPolicy'
        'New-SLDlpPolicy'
        'Set-SLDlpPolicy'
        'Remove-SLDlpPolicy'
        'Get-SLDlpRule'
        'New-SLDlpRule'
        'Set-SLDlpRule'
        'Remove-SLDlpRule'
        'Get-SLSensitiveInfoType'
        'Set-SLSensitiveInfoType'

        # Protection (AIPService)
        'Get-SLProtectionConfig'
        'Get-SLOnboardingPolicy'
        'Set-SLOnboardingPolicy'
        'Get-SLProtectionTemplate'
        'Export-SLProtectionTemplate'
        'Import-SLProtectionTemplate'
        'Remove-SLProtectionTemplate'
        'Get-SLDocumentTrack'
        'Revoke-SLDocumentAccess'
        'Restore-SLDocumentAccess'
        'Get-SLProtectionLog'
        'Get-SLProtectionKey'
        'Get-SLProtectionAdmin'

        # Elevation
        'Enable-SLSuperUser'
        'Disable-SLSuperUser'
        'Get-SLSuperUserStatus'
        'Grant-SLSiteAdmin'
        'Revoke-SLSiteAdmin'
        'Grant-SLMailboxAccess'
        'Revoke-SLMailboxAccess'
        'Request-SLPimRole'
        'Get-SLElevationStatus'
        'Start-SLElevatedJob'
        'Invoke-SLElevatedAction'
        'Stop-SLElevatedJob'

        # Analysis
        'Test-SLPermission'
        'Test-SLLabelDlpAlignment'
        'Test-SLPolicyConflict'
        'Test-SLDeploymentReadiness'
        'Get-SLLabelReport'
        'Get-SLPolicyHealth'
        'Get-SLLabelMismatch'

        # Templates
        'Get-SLTemplate'
        'Deploy-SLTemplate'

        # Reporting
        'Get-SLActivityReport'
        'Get-SLAuditLog'

        # File Shares (CIFS/SMB)
        'Connect-SLFileShare'
        'Disconnect-SLFileShare'
        'Get-SLFileShareLabel'
        'Set-SLFileShareLabel'
        'Remove-SLFileShareLabel'
        'Set-SLFileShareLabelBulk'
        'Get-SLFileShareScan'
        'Get-SLFileShareInventory'

        # Snapshot
        'New-SLSnapshot'
        'Get-SLSnapshot'
        'Remove-SLSnapshot'
        'Compare-SLSnapshot'
        'Restore-SLSnapshot'
    )
    CmdletsToExport   = @()
    VariablesToExport  = @()
    AliasesToExport    = @()
    PrivateData        = @{
        PSData = @{
            Tags       = @('Purview', 'DLP', 'SensitivityLabels', 'RetentionLabels', 'Compliance', 'Microsoft365', 'InformationProtection')
            ProjectUri = 'https://github.com/chillbot-io/stablelabel'
        }
    }
}
