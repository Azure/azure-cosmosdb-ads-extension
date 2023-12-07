using Newtonsoft.Json;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class CancelTokenPayload
    {
        [JsonProperty("cancelationTokenId")]
        public long CancelationTokenId { get; set; }
    }
}