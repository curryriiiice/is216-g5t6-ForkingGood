<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import axios from 'axios'
import Modal from '@/components/Modal.vue'
import { useRouter } from 'vue-router'
import { useAuthUser } from '@/lib/useAuthUser'

// API configuration
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

// Auth User setup using composable
const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null) // Reactive email

const router = useRouter()

// UI state for search and display
const query = ref('') // Input model for the search bar
const searchResults = ref([]) // Array of users currently displayed (filtered or all)
const searchLoading = ref(false) // Used for the initial load of all users
const searchError = ref('') // Error specifically for fetching/displaying the user list

// Cache for ALL users fetched on load
const allUsersCache = ref([])

// State for Pending Friend Requests Modal (shows incoming requests)
const showPendingModal = ref(false)
const pendingRequests = ref([]) // Array of { sender_email: '...' }
const pendingLoading = ref(false) // Loading state for fetching pending requests
const pendingError = ref('') // Error message for the pending requests modal

// State for Profile Popup Modal
const showProfileModal = ref(false)
const profileData = ref(null) // Holds the user object being viewed in the modal
const profilePosts = ref([]) // Posts belonging to the user in the profile modal
const profileLoading = ref(false) // Loading state for fetching posts within the profile modal
const profileError = ref('') // Error message for the profile modal's post section

// State for Remove Confirmation Modal
const showConfirmRemoveModal = ref(false)
const userToRemove = ref(null) // Stores the user object when remove is clicked
const removingFriend = ref(false) // Loading state for the confirm button

// Fetches the complete list of users (except self) from the backend on component mount
async function fetchAllUsers() {
  // Guard clause: Ensure user is logged in before fetching
  if (!activeEmail.value) {
     searchError.value = 'Please log in to view users.'
     searchLoading.value = false; allUsersCache.value = []; searchResults.value = []; return;
  }
  searchLoading.value = true; searchError.value = '';
  try {
    // Fetch all users data from the backend
    const r = await api.post('/user/getAllUsers', { user_email: activeEmail.value }) //
    const usersData = Array.isArray(r.data?.data) ? r.data.data : [] //

    // Process and store the fetched user data
    allUsersCache.value = usersData
      // Exclude the current logged-in user from the list
      .filter((u) => u.email && u.email.toLowerCase() !== activeEmail.value.toLowerCase())
      // Map to a consistent internal structure
      .map((u) => ({
        email: u.email, //
        username: u.username, //
        name: u.username || u.email.split('@')[0], // Display name (username or inferred from email)
        avatar: u.profile_image_url || '/default-avatar.jpg', // Avatar URL or fallback
        isFriend: u.friendship_status === 'friend', // Boolean indicating friendship
        isPending: u.friendship_status === 'pending', // Boolean indicating pending request
      }))
      // Sort the entire user list alphabetically by name immediately after fetching
      .sort((a, b) => a.name.localeCompare(b.name));

    // Initially display all users (sorted)
    searchResults.value = [...allUsersCache.value];

  } catch (e) {
    // Handle errors during fetch
    console.error('[friends] fetchAllUsers failed', e);
    searchError.value = e.response?.data?.message || 'Failed to load user list.';
    allUsersCache.value = []; searchResults.value = []; // Clear data on error
  } finally {
    // Ensure loading state is turned off
    searchLoading.value = false;
  }
}

// Filters the displayed user list based on the search input
const onSearchInput = () => {
  searchError.value = '' // Clear previous search errors
  const q = query.value.trim().toLowerCase() // Get and normalize search query

  // If search is empty, show all users from the sorted cache
  if (!q) {
    searchResults.value = [...allUsersCache.value];
  } else {
    // Filter the cached user list
    searchResults.value = allUsersCache.value.filter((user) => {
        // Match if email starts with the query
        const emailMatch = user.email.toLowerCase().startsWith(q);
        // Match if username starts with the query (ignoring the leading '@')
        const usernameMatch = user.username && user.username.length > 1
          ? user.username.toLowerCase().substring(1).startsWith(q)
          : false;
        return emailMatch || usernameMatch;
      });
      // The filtered list maintains the original sort order
  }
}

// Sends a friend request to a user
async function sendFriendReq(user) {
  if (!activeEmail.value) return; // Guard
  // Optimistic UI: Immediately show the 'Pending' state
  user.isPending = true
  user.isFriend = false
  try {
    // Call backend endpoint
    await api.post('/friends/sendFriendReq', {
      user_email: activeEmail.value,
      friend_email: user.email,
    })
    // If successful, UI remains 'Pending'
  } catch (e) {
    // On failure, log error, revert UI, and show alert
    console.error('[friends] add failed', e)
    user.isPending = false // Rollback UI state
    alert(`Error: ${e.response?.data?.message || 'A request might already be pending or an error occurred.'}`)
  }
}

// Opens the confirmation modal before removing a friend
function removeFriend(user) {
  if (!activeEmail.value) return; // Guard
  userToRemove.value = user; // Store the user to be removed
  showConfirmRemoveModal.value = true; // Open the modal
}

// --- UPDATED: confirmRemove function no longer removes user from list ---
// Performs the actual friend removal after confirmation
async function confirmRemove() {
  if (!userToRemove.value || !activeEmail.value) return;

  const user = userToRemove.value; // Get the user from the ref
  removingFriend.value = true; // Show loading state on button
  searchError.value = ''; // Clear main page error

  // Store original status for potential rollback
  const originalStatus = { isFriend: user.isFriend, isPending: user.isPending };

  // Optimistic UI update: Change button state to 'Add' immediately
  user.isFriend = false;
  user.isPending = false;
  // NOTE: We are NOT filtering the user out of searchResults or allUsersCache here

  try {
    // Call backend endpoint
    await api.delete('/friends/removeFriend', {
      data: { // DELETE request body must be in 'data' field for Axios
        user_email: activeEmail.value,
        friend_email: user.email,
      },
    })
    // Success: UI already updated to show 'Add', just close modal
    closeConfirmRemoveModal();

  } catch (e) {
    console.error('[friends] remove failed', e)
    // Rollback UI on error: Set status back to 'friend'
    user.isFriend = originalStatus.isFriend;
    user.isPending = originalStatus.isPending;
    // Show error message on the main page
    searchError.value = e.response?.data?.message || 'Could not remove friend';
    closeConfirmRemoveModal(); // Close modal even on error
  } finally {
    removingFriend.value = false; // Hide loading state
  }
}

// Cancels the removal process and closes the confirmation modal
function cancelRemove() {
  closeConfirmRemoveModal();
}

// Helper to close and reset the confirmation modal state
function closeConfirmRemoveModal() {
    showConfirmRemoveModal.value = false;
    // Delay clearing userToRemove slightly for smoother transition if needed
    setTimeout(() => {
        userToRemove.value = null;
        removingFriend.value = false;
    }, 300);
}


// Loads INCOMING pending friend requests for the modal
async function loadPendingRequests() {
  if (!activeEmail.value) { pendingRequests.value = []; return; } // Guard
  pendingLoading.value = true; pendingError.value = ''; pendingRequests.value = [];
  try {
    // Backend endpoint MUST return only requests SENT TO activeEmail.value
    const r = await api.post('/friends/getPendingFriendReqs', { user_email: activeEmail.value })
    const emailList = Array.isArray(r.data?.data) ? r.data.data : []
    // Store the list of emails who sent requests
    pendingRequests.value = emailList.map((email) => ({ sender_email: email }))
  } catch (e) {
    console.error('[friends] loadPendingRequests failed', e);
    pendingError.value = 'Failed to load pending requests.'; // Set error for modal display
  } finally {
    pendingLoading.value = false;
  }
}
// Opens the pending requests modal
async function openPendingModal() { showPendingModal.value = true; await loadPendingRequests(); }
// Accepts an incoming friend request
async function acceptFriendReq(senderEmail) {
   if (!activeEmail.value) return; // Guard
   try {
    await api.post('/friends/acceptFriendReq', { user_email: activeEmail.value, friend_email: senderEmail }); //
    // Update modal list
    pendingRequests.value = pendingRequests.value.filter((req) => req.sender_email !== senderEmail);
    // Update the user's status in the main list/cache if they are currently displayed
    const acceptedUserCache = allUsersCache.value.find((u) => u.email === senderEmail);
    if (acceptedUserCache) { acceptedUserCache.isFriend = true; acceptedUserCache.isPending = false; }
    const acceptedUserSearch = searchResults.value.find((u) => u.email === senderEmail);
    if (acceptedUserSearch) { acceptedUserSearch.isFriend = true; acceptedUserSearch.isPending = false; }
  } catch (e) { console.error('[friends] acceptFriendReq failed', e); pendingError.value = 'Failed to accept request.'; }
}
// Rejects an incoming friend request
async function rejectFriendReq(senderEmail) {
   if (!activeEmail.value) return; // Guard
   try {
    await api.post('/friends/rejectFriendReq', { user_email: activeEmail.value, friend_email: senderEmail }); //
    // Update modal list
    pendingRequests.value = pendingRequests.value.filter((req) => req.sender_email !== senderEmail);
     // Update the user's status in the main list/cache (they are now 'not_friend')
    const rejectedUserCache = allUsersCache.value.find((u) => u.email === senderEmail);
    if (rejectedUserCache) { rejectedUserCache.isFriend = false; rejectedUserCache.isPending = false; }
    const rejectedUserSearch = searchResults.value.find((u) => u.email === senderEmail);
    if (rejectedUserSearch) { rejectedUserSearch.isFriend = false; rejectedUserSearch.isPending = false; }
  } catch (e) { console.error('[friends] rejectFriendReq failed', e); pendingError.value = 'Failed to reject request.'; }
}

// Opens the profile modal for a given user
async function viewProfile(user) {
  profileData.value = user // Set user data for modal header
  profilePosts.value = []    // Clear posts from any previous modal view
  profileError.value = ''    // Clear errors
  profileLoading.value = true // Set loading state for posts
  showProfileModal.value = true // Open the modal
  await fetchProfilePosts(user) // Trigger post fetching
}

// Fetches posts for the user shown in the profile modal
async function fetchProfilePosts(user) {
  if (!user || !user.email) {
    profileError.value = 'User data is missing.'; profileLoading.value = false; return;
  }
  try {
    // Fetch posts based on friendship status
    const fetchFriendsPosts = user.isFriend === true;
    // Call endpoint
    const r = await api.post('/user/getUserPosts', {
      user_email: user.email,
      friends: fetchFriendsPosts,
    });
    // Normalize and store posts
    profilePosts.value = (Array.isArray(r.data?.data) ? r.data.data : []).map(normalizePostData)
  } catch (e) {
    console.error(`[friends] fetchProfilePosts for ${user.email} failed`, e);
    profileError.value = e.response?.data?.message || 'Failed to load posts for this user.';
    profilePosts.value = [];
  } finally {
    profileLoading.value = false;
  }
}

// Closes the profile modal and resets state
function closeProfileModal() {
  showProfileModal.value = false;
  // Delay reset for fade-out animation
  setTimeout(() => {
    profileData.value = null; profilePosts.value = [];
    profileLoading.value = false; profileError.value = '';
  }, 300);
}

// Normalizes post data (used for profile modal grid)
function normalizePostData(post) {
  // Use picURLs array if available
  const imageUrl = Array.isArray(post.picURLs) && post.picURLs.length > 0 ? post.picURLs[0] : '/images/placeholder-restaurant.jpg';
  let rating = post.rating ?? null; //
  rating = (rating !== null && !isNaN(Number(rating))) ? Number(rating) : null;
  // Return structure needed for the profile modal's post grid
  return { id: post.postid, restaurant_name: post.restaurant_name || 'Restaurant', rating: rating, imageUrl: imageUrl };
}

// Navigates to the dashboard view for a specific post detail
function viewPostDetail(postId) {
  closeProfileModal(); // Close profile modal before navigating
  // Use router to navigate, passing postId as a query parameter
  router.push({ path: '/dashboard', query: { postId: postId } }).catch(() => {});
}

// Component Mounted Lifecycle Hook
onMounted(async () => {
  await refreshAuthUser(); // Ensure auth state is current
  // Fetch initial data concurrently
  await Promise.all([ fetchAllUsers(), loadPendingRequests() ]);
  await nextTick(); // Wait for DOM updates if needed
});
// Watch for changes in user login status
watch(activeEmail, async (newEmail, oldEmail) => {
  // Refetch data if user logs in or out
  if (newEmail !== oldEmail) { await Promise.all([ fetchAllUsers(), loadPendingRequests() ]); }
});

</script>

<template>
  <div class="page sage-bg">
    <section class="container py-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h2 class="section-title">Community</h2>
        <div class="d-flex gap-2 align-items-center">
          <input
            v-model="query"
            @input="onSearchInput"
            class="form-control form-control-sm"
            placeholder="Search user..."
            style="min-width: 220px"
          />
          <button
            class="btn btn-sm btn-outline-secondary position-relative"
            @click="openPendingModal"
            title="Pending Requests"
          >
            Requests
            <span
              v-if="pendingRequests.length > 0"
              class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
            >
              {{ pendingRequests.length }}
              <span class="visually-hidden">pending requests</span>
            </span>
          </button>
        </div>
      </div>

      <div v-if="searchLoading" class="text-center text-muted py-5 mb-3"> Loading user list... </div>
      <div v-else-if="searchError" class="alert alert-danger py-2 mb-3">{{ searchError }}</div>
      <div v-else-if="!searchResults.length && query" class="empty text-muted p-4 rounded-3 bg-white shadow-sm mb-3"> No users found starting with "{{ query }}". </div>
      <div v-else-if="!searchResults.length && !query && !searchLoading && allUsersCache.length === 0" class="empty text-muted p-4 rounded-3 bg-white shadow-sm mb-3"> No users to display. </div>

      <div class="row g-3" v-else>
        <div v-for="user in searchResults" :key="user.email" class="col-12 col-md-6 col-lg-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body d-flex gap-3 align-items-center">
              <img
                :src="user.avatar"
                alt="Avatar"
                class="rounded-circle flex-shrink-0"
                style="width: 56px; height: 56px; object-fit: cover; border: 1px solid #eee"
                @error="$event.target.src='/default-avatar.jpg'"
              />
              <div class="flex-grow-1" style="min-width: 0">
                 <a href="#" @click.prevent="viewProfile(user)" class="text-decoration-none profile-link" :title="`View ${user.name}'s profile`">
                  <div class="fw-bold text-truncate text-dark">{{ user.name }}</div>
                  <div class="text-muted small text-truncate">{{ user.email }}</div>
                </a>
              </div>
              <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0">
                <button v-if="user.isFriend" class="btn btn-sm btn-outline-danger" @click="removeFriend(user)"> Remove </button>
                <button v-else-if="user.isPending" class="btn btn-sm btn-outline-secondary" disabled> Pending </button>
                <button v-else class="btn btn-sm btn-fit" @click="sendFriendReq(user)"> Add </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <Modal :show="showPendingModal" title="Incoming Friend Requests" @close="showPendingModal = false">
         <div v-if="pendingLoading" class="text-center text-muted py-3">Loading requests…</div>
          <div v-else-if="pendingError" class="alert alert-danger py-2">{{ pendingError }}</div>
          <div v-else-if="!pendingRequests.length" class="text-center text-muted py-3"> You have no pending friend requests. </div>
          <div v-else>
            <ul class="list-group list-group-flush">
              <li v-for="req in pendingRequests" :key="req.sender_email" class="list-group-item d-flex align-items-center justify-content-between">
                <div class="fw-semibold text-truncate">{{ req.sender_email }}</div>
                <div class="d-flex gap-2 flex-shrink-0">
                  <button class="btn btn-sm btn-primary" @click="acceptFriendReq(req.sender_email)"> Accept </button>
                  <button class="btn btn-sm btn-outline-danger" @click="rejectFriendReq(req.sender_email)"> Reject </button>
                </div>
              </li>
            </ul>
          </div>
    </Modal>

    <Modal :show="showProfileModal" :title="`${profileData?.name || 'User Profile'}`" @close="closeProfileModal" size="lg">
        <div v-if="profileData" class="profile-modal-content">
            <div class="profile-header d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded border">
                 <img
                    :src="profileData.avatar"
                    alt="Avatar"
                    class="rounded-circle flex-shrink-0"
                    style="width: 80px; height: 80px; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"
                    @error="$event.target.src='/default-avatar.jpg'"
                 />
                 <div class="flex-grow-1" style="min-width: 0">
                    <div class="fw-bold h5 mb-0 text-truncate">{{ profileData.name }}</div>
                    <div class="text-muted small text-truncate">{{ profileData.email }}</div>
                 </div>
            </div>

            <h6 class="fw-semibold mb-3 ps-1 section-sub-title">
              Posts {{ profileData.isFriend ? '' : '(Public Only)' }}
            </h6>
            <div v-if="profileLoading" class="text-center text-muted py-4">
              <div class="spinner-border spinner-border-sm text-secondary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <span class="ms-2">Loading posts...</span>
            </div>
            <div v-else-if="profileError" class="alert alert-warning py-2 small">{{ profileError }}</div>
            <div v-else-if="!profilePosts.length" class="text-center text-muted py-4 small profile-empty-posts">
                {{ profileData.isFriend ? 'This user hasn\'t posted anything yet.' : 'This user hasn\'t made any public posts yet.' }}
            </div>
            <div v-else class="row g-2 profile-posts-grid">
                 <div v-for="post in profilePosts" :key="post.id" class="col-4">
                    <div
                        class="card post-card h-100 border-0 card-clickable profile-post-card"
                        @click="viewPostDetail(post.id)"
                        role="button"
                        tabindex="0"
                        :title="`View post for ${post.restaurant_name}`"
                    >
                        <div class="post-image-wrapper">
                           <img :src="post.imageUrl" class="card-img-top post-image" alt="Post image" @error="$event.target.src='/images/placeholder-restaurant.jpg'">
                           <span v-if="post.rating !== null" class="badge rating-badge">⭐ {{ Number(post.rating).toFixed(1) }}</span>
                        </div>
                    </div>
                 </div>
            </div>
        </div>
        <div v-else class="text-center text-muted py-5">Loading profile...</div>
    </Modal>

    <Modal :show="showConfirmRemoveModal" title="Remove Friend" @close="cancelRemove">
        <div v-if="userToRemove" class="p-2">
            <p>Are you sure you want to remove <strong>{{ userToRemove.name || userToRemove.email }}</strong> from your friends list?</p>
            <div class="d-flex justify-content-end gap-2 mt-4">
                 <button class="btn btn-outline-secondary" @click="cancelRemove" :disabled="removingFriend">Cancel</button>
                 <button class="btn btn-danger" @click="confirmRemove" :disabled="removingFriend">
                    <span v-if="removingFriend" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    {{ removingFriend ? 'Removing...' : 'Confirm Remove' }}
                 </button>
            </div>
        </div>
    </Modal>

  </div>
</template>

<style scoped>
.page { min-height: calc(100vh - 56px); padding: 18px 0 80px; }
.section-title { font-weight: 800; color: var(--charcoal); margin: 0; }
.empty { text-align: center; color: var(--ink-400); font-weight: 500; }
.btn-fit { background: var(--accent, var(--terra-500, #ca6b4f)); color: #fff; border: 0; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12); }
.btn-fit:disabled { opacity: 0.6; }

.profile-link:hover .text-dark { color: var(--accent, #ca6b4f) !important; }
.profile-link:hover .text-muted { color: var(--accent, #ca6b4f) !important; opacity: 0.8; }

.list-group-item { background: transparent; padding-left: 0; padding-right: 0; border: 0; border-bottom: 1px solid var(--line-100, #eee); }
.list-group-flush > .list-group-item:last-child { border-bottom-width: 0; }

.profile-modal-content { padding: 0.25rem; }
.profile-header { border-bottom: 1px solid var(--line-100, #eee); background-color: var(--surface-hover, #f8f9fa) !important; }
.section-sub-title { color: var(--ink-700); }
.profile-posts-grid {
    max-height: calc(75vh - 200px);
    overflow-y: auto;
    padding: 0 0.5rem 0.5rem;
    margin-right: -8px;
    padding-right: 8px;
}
.profile-empty-posts { font-style: italic; }

.profile-post-card .post-image-wrapper { padding-top: 100%; position: relative; }
.profile-post-card .post-image { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.profile-post-card .rating-badge { position: absolute; top: 4px; right: 4px; font-size: 0.65rem; padding: 1px 4px; background-color: rgba(0,0,0,0.7); color: #fff; border-radius: 4px; }
.profile-post-card.card-clickable:hover {
    transform: none; box-shadow: none;
    outline: 2px solid var(--accent, #ca6b4f); outline-offset: 1px;
}

:deep(.modal .modal-content) { background: var(--surface); color: var(--charcoal); border: 1px solid var(--line-200); border-radius: 16px; box-shadow: var(--shadow-card); }
:deep(.modal-body) { padding: 1rem 1.25rem; }
:deep(.modal-header) { border-bottom: 1px solid var(--line-100); padding: 0.75rem 1.25rem; }
:deep(.modal-title) { font-weight: 700; font-size: 1.1rem; }
:deep(.modal.modal-lg .modal-dialog) { max-width: 800px; }
:deep(.modal .btn-primary) { background: var(--sage-600); border: none; color: #fff; font-weight: 800; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12); }
:deep(.modal .btn-danger) { background-color: #dc3545; border-color: #dc3545; color: #fff; }
:deep(.modal .btn-danger:hover) { background-color: #bb2d3b; border-color: #b02a37; }
</style>