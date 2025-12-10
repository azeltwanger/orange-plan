import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { differenceInMonths } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    // This function can be called manually for testing or via a scheduled cron job
    const base44 = createClientFromRequest(req);
    
    // Use service role to check all users' settings
    const allSettings = await base44.asServiceRole.entities.UserSettings.filter({
      dead_mans_switch_enabled: true
    });

    const results = [];
    const threshold = 6; // 6 months

    for (const settings of allSettings) {
      // Skip if email was already sent
      if (settings.dead_mans_switch_email_sent) {
        results.push({
          user_id: settings.created_by,
          status: 'already_sent',
          last_checkin: settings.dead_mans_switch_last_checkin
        });
        continue;
      }

      // Calculate months since last check-in
      const lastCheckin = settings.dead_mans_switch_last_checkin 
        ? new Date(settings.dead_mans_switch_last_checkin)
        : null;

      if (!lastCheckin) {
        results.push({
          user_id: settings.created_by,
          status: 'no_checkin_recorded',
        });
        continue;
      }

      const monthsSinceCheckin = differenceInMonths(new Date(), lastCheckin);

      if (monthsSinceCheckin >= threshold) {
        // Trigger the inheritance protocol email
        try {
          // Get user's estate items to find beneficiaries
          const estateItems = await base44.asServiceRole.entities.EstateItem.filter({
            created_by: settings.created_by,
            item_type: 'beneficiary'
          });

          const beneficiariesWithEmail = estateItems.filter(b => b.beneficiary_email);

          if (beneficiariesWithEmail.length === 0) {
            results.push({
              user_id: settings.created_by,
              status: 'no_beneficiary_emails',
              months_since_checkin: monthsSinceCheckin
            });
            continue;
          }

          // Generate inheritance protocol report
          const btcCustody = await base44.asServiceRole.entities.EstateItem.filter({
            created_by: settings.created_by,
            item_type: 'custody_location'
          });

          const recoveryProtocols = await base44.asServiceRole.entities.RecoveryProtocol.filter({
            created_by: settings.created_by
          });

          // Build protocol report
          let report = `INHERITANCE PROTOCOL - AUTOMATED NOTIFICATION\n`;
          report += `Generated: ${new Date().toISOString()}\n`;
          report += `${'='.repeat(60)}\n\n`;
          report += `This message was automatically sent because the account owner has not checked in for ${monthsSinceCheckin} months.\n\n`;

          report += `BENEFICIARIES\n`;
          report += `${'-'.repeat(40)}\n`;
          beneficiariesWithEmail.forEach(b => {
            report += `• ${b.beneficiary_name || b.title}: ${b.beneficiary_allocation_percent}%\n`;
            if (b.beneficiary_email) report += `  Email: ${b.beneficiary_email}\n`;
          });
          report += `\n`;

          report += `BITCOIN CUSTODY & RECOVERY\n`;
          report += `${'-'.repeat(40)}\n`;
          const btcLocations = btcCustody.filter(c => !c.description?.includes('asset_type:') || c.description?.includes('asset_type:btc'));
          btcLocations.forEach(custody => {
            report += `\n📍 ${custody.title}\n`;
            report += `   Type: ${custody.custody_type?.replace('_', ' ')}\n`;
            report += `   Amount: ${custody.btc_amount || 0} BTC\n`;
            
            const custodyProtocols = recoveryProtocols
              .filter(p => p.custody_location_id === custody.id)
              .sort((a, b) => a.step_number - b.step_number);
            
            if (custodyProtocols.length > 0) {
              report += `\n   RECOVERY STEPS:\n`;
              custodyProtocols.forEach(p => {
                report += `   ${p.step_number}. ${p.instruction}\n`;
                if (p.location_hint) report += `      Location: ${p.location_hint}\n`;
                if (p.requires_passphrase) report += `      ⚠️ Requires passphrase: ${p.passphrase_hint}\n`;
                if (p.verification_method) report += `      Verify: ${p.verification_method}\n`;
              });
            } else {
              report += `   ⚠️ NO RECOVERY PROTOCOL DEFINED\n`;
            }
          });

          // Get other assets
          const otherAssets = btcCustody.filter(c => c.description?.includes('asset_type:') && !c.description?.includes('asset_type:btc'));
          if (otherAssets.length > 0) {
            report += `\n\nOTHER ASSETS CHECKLIST\n`;
            report += `${'-'.repeat(40)}\n`;
            otherAssets.forEach(asset => {
              const assetType = asset.description?.includes('asset_type:') 
                ? asset.description.split('asset_type:')[1]?.split(',')[0] 
                : 'other';
              const usdValue = asset.description?.includes('usd_value:') 
                ? parseFloat(asset.description.split('usd_value:')[1]?.split(',')[0]) || 0 
                : 0;
              const accessInstructions = asset.description?.includes('access:') 
                ? asset.description.split('access:')[1] 
                : '';
              
              report += `\n☐ ${asset.title}\n`;
              report += `   Type: ${assetType}\n`;
              if (usdValue) report += `   Value: $${usdValue.toLocaleString()}\n`;
              if (accessInstructions) report += `   Access: ${accessInstructions}\n`;
              if (asset.notes) report += `   Notes: ${asset.notes}\n`;
            });
          }

          report += `\n\n${'='.repeat(60)}\n`;
          report += `IMPORTANT: This is an automated notification from Orange Plan's\n`;
          report += `Dead Man's Switch feature. Please secure this information.\n`;

          // Send email to all beneficiaries
          const emailResults = [];
          for (const beneficiary of beneficiariesWithEmail) {
            try {
              await base44.asServiceRole.integrations.Core.SendEmail({
                to: beneficiary.beneficiary_email,
                subject: 'URGENT: Inheritance Protocol Notification - Orange Plan',
                body: report,
              });
              emailResults.push({ email: beneficiary.beneficiary_email, status: 'sent' });
            } catch (emailError) {
              emailResults.push({ email: beneficiary.beneficiary_email, status: 'failed', error: emailError.message });
            }
          }

          // Mark as sent
          await base44.asServiceRole.entities.UserSettings.update(settings.id, {
            dead_mans_switch_email_sent: true
          });

          results.push({
            user_id: settings.created_by,
            status: 'emails_sent',
            months_since_checkin: monthsSinceCheckin,
            beneficiaries_notified: emailResults.length,
            email_results: emailResults
          });

        } catch (error) {
          results.push({
            user_id: settings.created_by,
            status: 'error',
            error: error.message,
            months_since_checkin: monthsSinceCheckin
          });
        }
      } else {
        results.push({
          user_id: settings.created_by,
          status: 'ok',
          months_since_checkin: monthsSinceCheckin,
          months_until_trigger: threshold - monthsSinceCheckin
        });
      }
    }

    return Response.json({
      checked_at: new Date().toISOString(),
      total_users_checked: allSettings.length,
      threshold_months: threshold,
      results
    });

  } catch (error) {
    console.error('Dead mans switch check error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});