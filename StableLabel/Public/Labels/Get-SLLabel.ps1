function Get-SLLabel {
    <#
    .SYNOPSIS
        Gets sensitivity labels from the Security & Compliance Center.
    .DESCRIPTION
        Retrieves sensitivity labels via the Compliance Center Get-Label cmdlet
        instead of the Graph API, avoiding Graph connection overhead. Supports
        fetching all labels, a single label by ID, or searching by name.
        The -Tree switch displays labels in a parent/sublabel hierarchy.
    .PARAMETER Id
        The GUID of a specific sensitivity label to retrieve.
    .PARAMETER Name
        A label display name to search for (exact match).
    .PARAMETER Tree
        Display labels in a parent/sublabel hierarchy.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLLabel
    .EXAMPLE
        Get-SLLabel -Id '00000000-0000-0000-0000-000000000001'
    .EXAMPLE
        Get-SLLabel -Name 'Confidential'
    .EXAMPLE
        Get-SLLabel -Tree
    #>
    [CmdletBinding(DefaultParameterSetName = 'All')]
    param(
        [Parameter(ParameterSetName = 'ById', ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Id,

        [Parameter(ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(ParameterSetName = 'All')]
        [switch]$Tree,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            switch ($PSCmdlet.ParameterSetName) {
                'ById' {
                    Write-Verbose "Retrieving sensitivity label with ID: $Id"
                    $result = Invoke-SLComplianceCommand -OperationName "Get-Label -Identity $Id" -ScriptBlock {
                        Get-Label -Identity $Id -ErrorAction Stop
                    }.GetNewClosure()

                    if ($result) {
                        $result = Convert-SLComplianceLabel -Label $result
                    }
                }
                'ByName' {
                    Write-Verbose "Searching for sensitivity label with name: $Name"
                    $allLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (all)' -ScriptBlock {
                        Get-Label -ErrorAction Stop
                    }
                    $allLabels = @($allLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

                    $result = $allLabels | Where-Object {
                        $_.name -eq $Name -or $_.displayName -eq $Name
                    }

                    if (-not $result) {
                        Write-Warning "No sensitivity label found with name '$Name'."
                        return
                    }
                }
                'All' {
                    Write-Verbose 'Retrieving all sensitivity labels.'
                    $allLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (all)' -ScriptBlock {
                        Get-Label -ErrorAction Stop
                    }
                    $allLabels = @($allLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

                    if ($Tree) {
                        $result = Build-SLLabelTree -Labels $allLabels
                    }
                    else {
                        $result = $allLabels
                    }
                }
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
