using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class CompletedResponseMessage : ResponseMessage
    {
        public CompletedResponseMessage()
        {
            Command = "completed";
        }
    }
}