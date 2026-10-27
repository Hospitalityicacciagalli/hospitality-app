// Edge Function: admin-user-management
// Percorso su Supabase: supabase/functions/admin-user-management/index.ts
//
// Struttura reale tabella user_profiles:
// id, first_name, last_name, display_name, role, is_active, created_at, updated_at
// NOTA: non esiste colonna email in user_profiles
//
// Azioni: create_user, ban_user, unban_user, reset_password_email,
//         update_email (aggiunta il 25/09/2026)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async function(req) {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    var supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Verifica autenticazione chiamante
    var authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Non autorizzato' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    var token = authHeader.replace('Bearer ', '')
    var { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token)

    if (callerError || !callerData.user) {
      return new Response(
        JSON.stringify({ error: 'Token non valido: ' + (callerError ? callerError.message : 'utente non trovato') }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verifica ruolo super_admin in user_profiles
    var { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single()

    if (profileError || !callerProfile || callerProfile.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Accesso negato: richiesto ruolo super_admin' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    var body = await req.json()
    var action = body.action
    var targetUserId = body.userId
    var targetEmail = body.email

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Parametro action mancante' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- AZIONE: Crea nuovo utente ---
    if (action === 'create_user') {
      var firstName = body.first_name
      var lastName = body.last_name
      var password = body.password
      var role = body.role

      if (!targetEmail || !password || !firstName || !lastName || !role) {
        return new Response(
          JSON.stringify({ error: 'Parametri mancanti: email, password, first_name, last_name, role sono obbligatori' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Crea utente in Supabase Auth
      var { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName
        }
      })

      if (createError) {
        var errMsg = createError.message
        if (errMsg.indexOf('already') !== -1) {
          errMsg = 'Esiste gia un utente con questa email.'
        }
        return new Response(
          JSON.stringify({ error: 'Errore creazione utente: ' + errMsg }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Crea profilo in user_profiles con la struttura reale della tabella
      var displayName = firstName + ' ' + lastName
      var { error: profileInsertError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id: newUser.user.id,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          role: role,
          is_active: true
        })

      if (profileInsertError) {
        return new Response(
          JSON.stringify({ error: 'Utente creato in Auth ma errore nel profilo: ' + profileInsertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Utente ' + displayName + ' creato con successo' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- AZIONE: Blocca utente ---
    if (action === 'ban_user') {
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: 'Parametro userId mancante' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      var { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: '876000h' }
      )

      if (banError) {
        return new Response(
          JSON.stringify({ error: 'Errore blocco utente: ' + banError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Aggiorna anche is_active in user_profiles
      await supabaseAdmin
        .from('user_profiles')
        .update({ is_active: false })
        .eq('id', targetUserId)

      return new Response(
        JSON.stringify({ success: true, message: 'Utente bloccato con successo' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- AZIONE: Sblocca utente ---
    if (action === 'unban_user') {
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: 'Parametro userId mancante' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      var { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: 'none' }
      )

      if (unbanError) {
        return new Response(
          JSON.stringify({ error: 'Errore sblocco utente: ' + unbanError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Aggiorna anche is_active in user_profiles
      await supabaseAdmin
        .from('user_profiles')
        .update({ is_active: true })
        .eq('id', targetUserId)

      return new Response(
        JSON.stringify({ success: true, message: 'Utente sbloccato con successo' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- AZIONE: Invia email reset password ---
    if (action === 'reset_password_email') {
      if (!targetEmail) {
        return new Response(
          JSON.stringify({ error: 'Parametro email mancante' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      var { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: 'https://hospitalityicacciagalli.com/aggiorna-password'
      })

      if (resetError) {
        return new Response(
          JSON.stringify({ error: 'Errore invio email: ' + resetError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Email di reset inviata a ' + targetEmail }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- AZIONE: Modifica email di un utente ---
    // Cambia l'indirizzo di accesso e lo segna gia' confermato:
    // nessuna mail di verifica parte, ne' verso il vecchio indirizzo
    // (che puo' essere sbagliato o inesistente) ne' verso il nuovo.
    // La password e il resto dell'account restano invariati.
    if (action === 'update_email') {
      var nuovaEmail = (body.newEmail || '').trim().toLowerCase()

      if (!targetUserId || !nuovaEmail) {
        return new Response(
          JSON.stringify({ error: 'Parametri mancanti: userId e newEmail sono obbligatori' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuovaEmail)) {
        return new Response(
          JSON.stringify({ error: 'Indirizzo email non valido: ' + nuovaEmail }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      var { data: updData, error: updError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { email: nuovaEmail, email_confirm: true }
      )

      if (updError) {
        var updMsg = updError.message
        if (updMsg.indexOf('already') !== -1) {
          updMsg = 'Esiste gia un utente con questa email.'
        }
        return new Response(
          JSON.stringify({ error: 'Errore modifica email: ' + updMsg }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      var emailSalvata = (updData && updData.user && updData.user.email) ? updData.user.email : nuovaEmail

      return new Response(
        JSON.stringify({ success: true, message: 'Email aggiornata: ora l\'accesso avviene con ' + emailSalvata }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Azione non riconosciuta: ' + action }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Errore interno: ' + err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})