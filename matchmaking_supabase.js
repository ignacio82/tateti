// matchmaking_supabase.js

// Make sure to replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = "https://lunxhfsvlfyhqehpirdi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bnhoZnN2bGZ5aHFlaHBpcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzMDMzMzMsImV4cCI6MjA2Mzg3OTMzM30.iKEnrtSVjwTQhB8OLahTANJzvCamR60bjhC6qvTtwxU";

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MATCHMAKING_TABLE = 'matchmaking_queue';
let matchmakingChannel = null;
let localPlayerPeerId = null;
let lookingForMatch = false;
let matchCheckInterval = null;

async function cleanupMyStaleEntries() {
    if (!localPlayerPeerId) return;
    console.log('[Matchmaking] Cleaning up any stale entries for peerId:', localPlayerPeerId);
    const { error } = await supabase
        .from(MATCHMAKING_TABLE)
        .delete()
        .eq('peer_id', localPlayerPeerId);

    if (error) {
        console.error('[Matchmaking] Error cleaning up stale entries:', error);
    }
}

async function findMatch() {
    if (!lookingForMatch || !localPlayerPeerId) return null;

    console.log('[Matchmaking] Checking for available opponents...');
    // Fetch other waiting players, oldest first, not ourselves
    const { data: availablePlayers, error } = await supabase
        .from(MATCHMAKING_TABLE)
        .select('peer_id, created_at')
        .eq('status', 'waiting')
        .not('peer_id', 'eq', localPlayerPeerId)
        .order('created_at', { ascending: true })
        .limit(10); // Look at a few recent ones

    if (error) {
        console.error('[Matchmaking] Error fetching available players:', error);
        return null;
    }

    if (availablePlayers && availablePlayers.length > 0) {
        // Try to "claim" the first available player
        const opponent = availablePlayers[0];
        console.log('[Matchmaking] Found potential opponent:', opponent.peer_id);

        // Attempt to mark both as 'matching' in a single transaction or close succession
        // This is a simple "claim" attempt. A more robust system might use a database function.
        // For now, we'll update our status and then the opponent's.

        // Update our status to 'matching' to signal we're trying to pair
        const { error: updateSelfError } = await supabase
            .from(MATCHMAKING_TABLE)
            .update({ status: 'matching', opponent_peer_id: opponent.peer_id })
            .eq('peer_id', localPlayerPeerId)
            .eq('status', 'waiting'); // Important: only update if we are still waiting

        if (updateSelfError || (await supabase.from(MATCHMAKING_TABLE).select().eq('peer_id', localPlayerPeerId).single()).data.status !== 'matching') {
            console.warn('[Matchmaking] Could not update self status to matching or someone else matched with us. Aborting this attempt.');
            // Reset our status if it wasn't 'matching' to avoid being stuck
            await supabase.from(MATCHMAKING_TABLE).update({ status: 'waiting', opponent_peer_id: null }).eq('peer_id', localPlayerPeerId);
            return null;
        }

        // Try to update opponent's status to 'matching'
        const { data: updatedOpponentData, error: updateOpponentError } = await supabase
            .from(MATCHMAKING_TABLE)
            .update({ status: 'matching', opponent_peer_id: localPlayerPeerId })
            .eq('peer_id', opponent.peer_id)
            .eq('status', 'waiting') // Important: only update if they are still waiting
            .select()
            .single();


        if (updateOpponentError || !updatedOpponentData || updatedOpponentData.status !== 'matching') {
            console.warn('[Matchmaking] Could not update opponent status to matching. They might have been matched by someone else. Reverting self.');
            // Revert our status back to 'waiting'
            await supabase
                .from(MATCHMAKING_TABLE)
                .update({ status: 'waiting', opponent_peer_id: null })
                .eq('peer_id', localPlayerPeerId);
            return null;
        }

        // If both updates were successful, we have a match!
        console.log('[Matchmaking] Successfully locked match with:', opponent.peer_id);
        lookingForMatch = false;
        if (matchCheckInterval) clearInterval(matchCheckInterval);
        matchCheckInterval = null;

        // Return the opponent's peer_id
        return opponent.peer_id;
    }
    return null;
}


export async function joinQueue(myPeerId, callbacks) {
    if (lookingForMatch) {
        console.warn('[Matchmaking] Already looking for a match.');
        callbacks.onError?.('Already looking for a match.');
        return;
    }

    localPlayerPeerId = myPeerId;
    lookingForMatch = true;
    callbacks.onSearching?.();

    // Clean up any previous entries for this peer_id
    await cleanupMyStaleEntries();

    // Add self to the queue
    const { error: insertError } = await supabase
        .from(MATCHMAKING_TABLE)
        .insert({ peer_id: localPlayerPeerId, status: 'waiting' });

    if (insertError) {
        console.error('[Matchmaking] Error joining queue:', insertError);
        callbacks.onError?.('Failed to join matchmaking queue.');
        lookingForMatch = false;
        localPlayerPeerId = null;
        return;
    }
    console.log('[Matchmaking] Successfully joined queue with peerId:', localPlayerPeerId);

    // Start polling for matches
    // Supabase Realtime can also be used here for more immediate updates,
    // but polling is simpler to start with and less prone to some race conditions
    // if not handled carefully with Realtime.
    if (matchCheckInterval) clearInterval(matchCheckInterval);
    matchCheckInterval = setInterval(async () => {
        if (!lookingForMatch) {
            clearInterval(matchCheckInterval);
            matchCheckInterval = null;
            return;
        }
        const opponentPeerId = await findMatch();
        if (opponentPeerId) {
            callbacks.onMatchFound?.(opponentPeerId);
            // The game.js logic will call leaveQueue after attempting connection or on timeout
        }
    }, 3000); // Check for a match every 3 seconds

    // Set a timeout for matchmaking
    setTimeout(async () => {
        if (lookingForMatch) {
            console.log('[Matchmaking] Matchmaking timed out.');
            callbacks.onTimeout?.();
            await leaveQueue(); // Automatically leave queue on timeout
        }
    }, 30000); // 30 seconds timeout
}

export async function leaveQueue() {
    console.log('[Matchmaking] Leaving queue...');
    lookingForMatch = false;
    if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
        matchCheckInterval = null;
    }

    if (localPlayerPeerId) {
        const { error } = await supabase
            .from(MATCHMAKING_TABLE)
            .delete()
            .eq('peer_id', localPlayerPeerId);

        if (error) {
            console.error('[Matchmaking] Error leaving queue:', error);
        } else {
            console.log('[Matchmaking] Successfully removed from queue:', localPlayerPeerId);
        }
        localPlayerPeerId = null;
    }

    if (matchmakingChannel) {
        supabase.removeChannel(matchmakingChannel);
        matchmakingChannel = null;
        console.log('[Matchmaking] Realtime channel removed.');
    }
}

// Optional: Implement Realtime listener for a more responsive experience
// This would replace or augment the polling interval.
export function listenForMatchesRealtime(myPeerId, callbacks) {
    if (matchmakingChannel) {
        supabase.removeChannel(matchmakingChannel);
    }
    localPlayerPeerId = myPeerId; // Ensure localPlayerPeerId is set

    console.log('[Matchmaking RT] Subscribing to matchmaking updates for table:', MATCHMAKING_TABLE);
    matchmakingChannel = supabase.channel('matchmaking')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: MATCHMAKING_TABLE },
            async (payload) => {
                console.log('[Matchmaking RT] New entry in queue:', payload.new);
                if (lookingForMatch && payload.new.peer_id !== localPlayerPeerId && payload.new.status === 'waiting') {
                    // A new player joined, try to match
                    const opponentPeerId = await findMatch(); // findMatch will handle claim logic
                    if (opponentPeerId) {
                        callbacks.onMatchFound?.(opponentPeerId);
                    }
                }
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: MATCHMAKING_TABLE },
            async (payload) => {
                // This part is tricky: if another player matched with US, our status would change.
                // We need to confirm that we are the 'opponent_peer_id' in their update.
                if (lookingForMatch && payload.new.status === 'matching' && payload.new.opponent_peer_id === localPlayerPeerId) {
                    console.log('[Matchmaking RT] We have been matched by:', payload.new.peer_id);

                    // Verify and finalize the match from our end.
                    const { data: selfEntry, error: selfError } = await supabase
                        .from(MATCHMAKING_TABLE)
                        .update({ status: 'matched', opponent_peer_id: payload.new.peer_id }) // Confirm match
                        .eq('peer_id', localPlayerPeerId)
                        .eq('status', 'waiting') // Ensure we were waiting and didn't initiate another match
                        .select()
                        .single();

                    if (selfError || !selfEntry || selfEntry.status !== 'matched') {
                        console.warn('[Matchmaking RT] Failed to confirm match or we already matched elsewhere.');
                        // Potentially try to revert if necessary, or let timeout handle cleanup.
                        return;
                    }

                    lookingForMatch = false;
                    if (matchCheckInterval) clearInterval(matchCheckInterval); // Stop polling if RT match found
                     matchCheckInterval = null;

                    callbacks.onMatchFound?.(payload.new.peer_id);
                }
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('[Matchmaking RT] Successfully subscribed to realtime matchmaking updates!');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('[Matchmaking RT] Realtime subscription error or timed out:', err || status);
                callbacks.onError?.('Realtime matchmaking connection error. Using polling.');
                // Fallback to polling if realtime fails, or rely on existing polling interval.
            }
        });
}

// Call this function when the matchmaking UI is initiated.
// Example usage (would be called from game.js):
// if (useRealtime) {
//   listenForMatchesRealtime(myPeerId, { onMatchFound, onError, onSearching });
//   // Still add self to queue via joinQueue which also initiates polling as a fallback or primary
// } else {
//   joinQueue(myPeerId, { onMatchFound, onError, onSearching, onTimeout });
// }